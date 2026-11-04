import asyncio
import json
import time
from contextlib import suppress
from types import SimpleNamespace

import pytest

from backend.app.pairing import PROTOCOL_VERSION, PairHub


class Socket:
    def __init__(self):
        self.headers = {}
        self.url = SimpleNamespace(scheme="ws", netloc="127.0.0.1", hostname="127.0.0.1")
        self.client = SimpleNamespace(host="127.0.0.1")
        self.incoming = asyncio.Queue()
        self.outgoing = asyncio.Queue()

    async def accept(self):
        return None

    async def close(self, code=1000):
        return None

    async def receive_text(self):
        return await self.incoming.get()

    async def send_json(self, value):
        await self.outgoing.put(value)

    async def send(self, value):
        await self.incoming.put(json.dumps(value))

    async def receive(self):
        return await asyncio.wait_for(self.outgoing.get(), timeout=1)


def message(role: str, sequence: int, message_type: str = "hello", **payload):
    return {
        "type": message_type,
        "role": role,
        "sessionId": "integration",
        "connectionId": f"{role}-connection",
        "protocolVersion": PROTOCOL_VERSION,
        "sequence": sequence,
        "sender": role,
        "sentAt": time.time() * 1000,
        **payload,
    }


@pytest.mark.asyncio
async def test_two_screens_stay_connected_after_mutual_hello_and_relay_setup():
    hub = PairHub()
    display, controller = Socket(), Socket()
    display_task = asyncio.create_task(hub.serve(display, "integration", "display"))
    controller_task = None
    try:
        await display.send(message("display", 1))
        await asyncio.sleep(0)
        controller_task = asyncio.create_task(hub.serve(controller, "integration", "controller"))
        await controller.send(message("controller", 1))
        display_hello, controller_hello = await asyncio.gather(display.receive(), controller.receive())
        assert display_hello["sender"] == "controller"
        assert controller_hello["sender"] == "display"

        # Browser channels acknowledge the received hello. These are ordinary
        # relay messages, not new socket handshakes.
        await asyncio.gather(display.send(message("display", 2)), controller.send(message("controller", 2)))
        controller_ack, display_ack = await asyncio.gather(controller.receive(), display.receive())
        assert controller_ack["sequence"] == 2
        assert display_ack["sequence"] == 2

        await controller.send(message(
            "controller", 3, "setup-view", view="difficulty", difficulty=4, recognitionReady=True,
        ))
        relayed = await display.receive()
        assert relayed["type"] == "setup-view"
        assert relayed["difficulty"] == 4
        assert relayed["recognitionReady"] is True
    finally:
        display_task.cancel()
        if controller_task:
            controller_task.cancel()
        with suppress(asyncio.CancelledError):
            await display_task
        if controller_task:
            with suppress(asyncio.CancelledError):
                await controller_task
