"""Local two-screen relay. Socket lifetime, not tab timers, owns each role."""
import asyncio
import json
import time
from contextlib import suppress
from dataclasses import dataclass

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .local_admin import loopback_host

router = APIRouter()
PROTOCOL_VERSION = 3
MAX_MESSAGE_BYTES = 1_000_000


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
            if not isinstance(hello, dict) or hello.get("type") != "hello" or hello.get("sender") != role or hello.get("sessionId") != session_id or hello.get("protocolVersion") != PROTOCOL_VERSION or not isinstance(hello.get("connectionId"), str) or not 1 <= len(hello["connectionId"]) <= 128 or not isinstance(hello.get("sequence"), int):
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
                allowed_types = {"hello", "exhibition-state"} if role == "display" else {"hello", "exhibition-action"}
                if not isinstance(message, dict) or message.get("type") not in allowed_types or message.get("sessionId") != session_id or message.get("sender") != role or message.get("connectionId") != hello["connectionId"] or message.get("protocolVersion") != PROTOCOL_VERSION:
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


hub = PairHub()


@router.websocket("/api/v1/pair/{session_id}/{role}")
async def paired_screen(socket: WebSocket, session_id: str, role: str):
    await hub.serve(socket, session_id, role)
