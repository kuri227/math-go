from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
import pytest

import backend.app.pairing as pairing


def hello(role, connection, sequence=1):
    return {"type": "hello", "sessionId": "test", "connectionId": connection, "protocolVersion": 3, "sequence": sequence, "sender": role, "role": role, "sentAt": 1}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(pairing, "hub", pairing.PairHub())
    app = FastAPI(); app.include_router(pairing.router)
    with TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 50000)) as client:
        yield client
    assert pairing.hub.sessions == {}


def test_pair_relay_duplicate_rejection_and_immediate_replacement(client):
    with client.websocket_connect("ws://127.0.0.1/api/v1/pair/test/display") as display:
        display.send_json(hello("display", "d"))
        with client.websocket_connect("ws://127.0.0.1/api/v1/pair/test/controller") as controller:
            controller.send_json(hello("controller", "c"))
            assert display.receive_json()["connectionId"] == "c"
            assert controller.receive_json()["connectionId"] == "d"
            frame = {**hello("display", "d", 2), "type": "exhibition-state", "snapshot": None}
            display.send_json(frame); assert controller.receive_json() == frame
            with client.websocket_connect("ws://127.0.0.1/api/v1/pair/test/controller") as duplicate:
                duplicate.send_json(hello("controller", "duplicate"))
                assert duplicate.receive_json()["reason"] == "role-already-connected"
                with pytest.raises(WebSocketDisconnect):
                    duplicate.receive_json()
        assert display.receive_json() == {"type": "pair-status", "connected": False}
        with client.websocket_connect("ws://127.0.0.1/api/v1/pair/test/controller") as replacement:
            replacement.send_json(hello("controller", "new"))
            assert display.receive_json()["connectionId"] == "new"
            assert replacement.receive_json()["connectionId"] == "d"
        display.receive_json()


def test_forged_identity_closes_socket(client):
    with client.websocket_connect("ws://127.0.0.1/api/v1/pair/test/display") as display:
        display.send_json(hello("display", "d"))
        display.send_json(hello("display", "different", 2))
        with pytest.raises(WebSocketDisconnect):
            display.receive_json()


@pytest.mark.parametrize("origin", ["https://evil.example", "null"])
def test_cross_origin_pairing_denied(client, origin):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("ws://127.0.0.1/api/v1/pair/test/display", headers={"Origin": origin}):
            pass
