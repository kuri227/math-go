"""Local two-screen relay. Socket lifetime, not tab timers, owns each role."""
import asyncio
import json
import math
import time
from contextlib import suppress
from dataclasses import dataclass
from collections import deque

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .local_admin import loopback_host

router = APIRouter()
PROTOCOL_VERSION = 6
MAX_MESSAGE_BYTES = 1_000_000
MAX_SESSIONS = 32
MAX_MESSAGES_PER_MINUTE = 1_200
MAX_SELECTED_QUESTIONS = 5_000
ALLOWED_TYPES = {
    "display": {"hello", "exhibition-state", "setup-error"},
    "controller": {"hello", "exhibition-action", "exhibition-control", "setup-view", "ink-snapshot"},
}


@dataclass
class Peer:
    socket: WebSocket
    hello: dict
    last_sequence: int
    message_times: deque[float]


class PairHub:
    def __init__(self):
        self.sessions: dict[str, dict[str, Peer]] = {}

    async def send(self, peer: Peer, message: dict):
        try:
            await asyncio.wait_for(peer.socket.send_json(message), timeout=2)
        except (WebSocketDisconnect, RuntimeError, OSError, asyncio.TimeoutError):
            pass  # Receive/disconnect cleanup remains the owner of membership.

    async def serve(self, socket: WebSocket, session_id: str, role: str):
        origin = socket.headers.get("origin")
        expected = f"{'https' if socket.url.scheme == 'wss' else 'http'}://{socket.url.netloc}"
        if role not in ("display", "controller") or not 1 <= len(session_id) <= 128 or not socket.client or not loopback_host(socket.client.host) or not loopback_host(socket.url.hostname or "") or origin is not None and origin != expected:
            await socket.close(code=1008)
            return
        await socket.accept()
        peer = None
        try:
            text = await asyncio.wait_for(socket.receive_text(), timeout=10)
            if len(text.encode()) > MAX_MESSAGE_BYTES:
                await socket.close(code=1009); return
            hello = json.loads(text)
            if not self.valid_hello(hello, session_id, role):
                await socket.close(code=1008); return
            if session_id not in self.sessions and len(self.sessions) >= MAX_SESSIONS:
                await socket.close(code=1013); return
            peers = self.sessions.setdefault(session_id, {})
            opposite = "controller" if role == "display" else "display"
            peer = Peer(socket, hello, hello["sequence"], deque())
            if role in peers:
                await self.send(peer, {"type": "connection-rejected", "targetConnectionId": hello["connectionId"], "reason": "role-already-connected", "sessionId": session_id, "connectionId": "pair-server", "protocolVersion": PROTOCOL_VERSION, "sequence": 0, "sender": opposite, "sentAt": time.time() * 1000})
                await socket.close(code=4409); return
            peers[role] = peer
            if opposite in peers:
                other = peers[opposite]
                await self.send(other, hello)
                await self.send(peer, other.hello)
            while True:
                text = await socket.receive_text()
                if len(text.encode()) > MAX_MESSAGE_BYTES:
                    await socket.close(code=1009); break
                message = json.loads(text)
                if not self.valid_message(message, session_id, role, hello["connectionId"]):
                    await socket.close(code=1008); break
                if message["sequence"] <= peer.last_sequence or not self.within_rate(peer):
                    await socket.close(code=1008); break
                peer.last_sequence = message["sequence"]
                if other := peers.get(opposite):
                    await self.send(other, message)
        except (WebSocketDisconnect, asyncio.TimeoutError, ValueError, RuntimeError):
            pass
        finally:
            peers = self.sessions.get(session_id, {})
            if peer is not None and peers.get(role) is peer:
                del peers[role]
                for other in list(peers.values()):
                    await self.send(other, {"type": "pair-status", "connected": False})
                if not peers:
                    self.sessions.pop(session_id, None)
            with suppress(RuntimeError, WebSocketDisconnect, OSError):
                await socket.close()

    @staticmethod
    def valid_token(value):
        return isinstance(value, str) and 1 <= len(value) <= 128

    @staticmethod
    def valid_envelope(message):
        sequence = message.get("sequence") if isinstance(message, dict) else None
        sent_at = message.get("sentAt") if isinstance(message, dict) else None
        return (
            isinstance(sequence, int)
            and not isinstance(sequence, bool)
            and sequence >= 1
            and isinstance(sent_at, (int, float))
            and not isinstance(sent_at, bool)
            and math.isfinite(sent_at)
        )

    @classmethod
    def valid_hello(cls, message, session_id, role):
        return (
            role in ALLOWED_TYPES
            and isinstance(message, dict)
            and message.get("type") == "hello"
            and message.get("sender") == role
            and message.get("sessionId") == session_id
            and message.get("protocolVersion") == PROTOCOL_VERSION
            and cls.valid_token(message.get("connectionId"))
            and cls.valid_envelope(message)
        )

    @classmethod
    def valid_message(cls, message, session_id, role, connection_id):
        if (
            role not in ALLOWED_TYPES
            or not isinstance(message, dict)
            or message.get("type") not in ALLOWED_TYPES[role]
            or message.get("sessionId") != session_id
            or message.get("sender") != role
            or message.get("connectionId") != connection_id
            or message.get("protocolVersion") != PROTOCOL_VERSION
            or not cls.valid_envelope(message)
        ):
            return False
        message_type = message.get("type")
        if not cls.bounded_json(message):
            return False
        # Each browser acknowledges the peer's initial hello after pairing.
        # It uses the ordinary message path and must not be mistaken for a new
        # socket handshake, otherwise both screens reconnect forever.
        if message_type == "hello":
            return message.get("role") == role
        if message_type == "setup-error":
            return cls.valid_short_text(message.get("message"), 500)
        if message_type == "exhibition-state":
            return message.get("snapshot") is None or isinstance(message.get("snapshot"), dict)
        if message_type == "exhibition-action":
            return (
                message.get("action") in {"recognize", "confirm", "rewrite", "next", "retry-test", "stop"}
                and cls.valid_token(message.get("runId"))
                and cls.valid_token(message.get("questionId"))
                and (message.get("requestId") is None or cls.valid_token(message.get("requestId")))
                and (message.get("error") is None or cls.valid_short_text(message.get("error"), 1000))
                and (message.get("response") is None or isinstance(message.get("response"), dict))
            )
        if message_type == "exhibition-control":
            action = message.get("action")
            if action == "configure":
                ids = message.get("questionIds")
                return (
                    message.get("mode") in {"exhibition", "test"}
                    and isinstance(message.get("difficulty"), int)
                    and not isinstance(message.get("difficulty"), bool)
                    and 1 <= message["difficulty"] <= 7
                    and isinstance(message.get("questionCount"), int)
                    and not isinstance(message.get("questionCount"), bool)
                    and 1 <= message["questionCount"] <= MAX_SELECTED_QUESTIONS
                    and isinstance(ids, list)
                    and len(ids) <= MAX_SELECTED_QUESTIONS
                    and (message["mode"] == "exhibition" and not ids or message["mode"] == "test" and len(ids) == message["questionCount"])
                    and all(cls.valid_token(item) for item in ids)
                )
            return (
                action in {"back-to-setup", "begin-countdown", "controller-ready"}
                and (message.get("runId") is None or cls.valid_token(message.get("runId")))
                and (message.get("questionId") is None or cls.valid_token(message.get("questionId")))
            )
        if message_type == "setup-view":
            difficulty = message.get("difficulty")
            return (
                message.get("view") in {"home", "rules", "difficulty", "staff"}
                and isinstance(difficulty, int)
                and not isinstance(difficulty, bool)
                and 1 <= difficulty <= 7
            )
        if message_type != "ink-snapshot":
            return False
        generation = message.get("generation")
        return (
            cls.valid_token(message.get("runId"))
            and cls.valid_token(message.get("questionId"))
            and isinstance(generation, int)
            and not isinstance(generation, bool)
            and generation >= 0
            and cls.valid_ink(message.get("ink"))
        )

    @staticmethod
    def valid_ink(ink):
        aspect = ink.get("aspectRatio") if isinstance(ink, dict) else None
        if not isinstance(ink, dict) or ink.get("version") != 1 or not isinstance(ink.get("revision"), int) or ink["revision"] < 0 or not isinstance(aspect, (int, float)) or isinstance(aspect, bool) or not math.isfinite(aspect) or not 0.05 <= aspect <= 20 or not isinstance(ink.get("strokes"), list):
            return False
        count = 0
        for stroke in ink["strokes"]:
            if not isinstance(stroke, list):
                return False
            count += len(stroke)
            if count > 12_000:
                return False
            for point in stroke:
                if not isinstance(point, dict):
                    return False
                values = (point.get("x"), point.get("y"), point.get("pressure"))
                if any(not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value < 0 or value > 1 for value in values):
                    return False
        return True

    @staticmethod
    def valid_short_text(value, maximum):
        return isinstance(value, str) and len(value) <= maximum

    @staticmethod
    def bounded_json(value, *, max_depth=14, max_nodes=60_000):
        nodes = 0
        stack = [(value, 0)]
        while stack:
            item, depth = stack.pop()
            nodes += 1
            if nodes > max_nodes or depth > max_depth:
                return False
            if isinstance(item, dict):
                if any(not isinstance(key, str) or len(key) > 128 for key in item):
                    return False
                stack.extend((child, depth + 1) for child in item.values())
            elif isinstance(item, list):
                stack.extend((child, depth + 1) for child in item)
            elif isinstance(item, str) and len(item) > 100_000:
                return False
        return True

    @staticmethod
    def within_rate(peer: Peer):
        now = time.monotonic()
        cutoff = now - 60
        while peer.message_times and peer.message_times[0] <= cutoff:
            peer.message_times.popleft()
        if len(peer.message_times) >= MAX_MESSAGES_PER_MINUTE:
            return False
        peer.message_times.append(now)
        return True


hub = PairHub()


@router.websocket("/api/v1/pair/{session_id}/{role}")
async def paired_screen(socket: WebSocket, session_id: str, role: str):
    await hub.serve(socket, session_id, role)
