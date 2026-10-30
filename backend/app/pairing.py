"""Local two-screen relay. Socket lifetime, not tab timers, owns each role."""
import asyncio
import json
import math
import time
from contextlib import suppress
from dataclasses import dataclass

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .local_admin import loopback_host

router = APIRouter()
PROTOCOL_VERSION = 5
MAX_MESSAGE_BYTES = 1_000_000
ALLOWED_TYPES = {
    "display": {"hello", "exhibition-state", "setup-error"},
    "controller": {"hello", "exhibition-action", "exhibition-control", "ink-snapshot"},
}


@dataclass
class Peer:
    socket: WebSocket
    hello: dict


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
            peers = self.sessions.setdefault(session_id, {})
            opposite = "controller" if role == "display" else "display"
            peer = Peer(socket, hello)
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
        if message.get("type") != "ink-snapshot":
            return True
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


hub = PairHub()


@router.websocket("/api/v1/pair/{session_id}/{role}")
async def paired_screen(socket: WebSocket, session_id: str, role: str):
    await hub.serve(socket, session_id, role)
