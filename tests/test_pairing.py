import math

import pytest

from backend.app.pairing import PairHub


def hello(role, connection="connection", sequence=1):
    return {"type": "hello", "sessionId": "test", "connectionId": connection,
            "protocolVersion": 5, "sequence": sequence, "sender": role,
            "role": role, "sentAt": 1}


def ink_message(**overrides):
    message = {**hello("controller"), "type": "ink-snapshot", "runId": "run",
               "questionId": "q", "generation": 1,
               "ink": {"version": 1, "revision": 1, "aspectRatio": 2,
                       "strokes": [[{"x": 0.5, "y": 0.5, "pressure": 0.7}]]}}
    message.update(overrides)
    return message


def test_hello_requires_bound_role_session_protocol_and_identity():
    assert PairHub.valid_hello(hello("display"), "test", "display")
    assert not PairHub.valid_hello(hello("controller"), "test", "display")
    assert not PairHub.valid_hello({**hello("display"), "sessionId": "other"}, "test", "display")
    assert not PairHub.valid_hello({**hello("display"), "protocolVersion": 4}, "test", "display")
    assert not PairHub.valid_hello(hello("display", ""), "test", "display")
    assert not PairHub.valid_hello({**hello("display"), "sequence": True}, "test", "display")
    assert not PairHub.valid_hello({**hello("display"), "sentAt": math.inf}, "test", "display")


def test_each_role_can_send_only_its_protocol_messages():
    display = {**hello("display"), "type": "exhibition-state", "snapshot": None}
    assert PairHub.valid_message(display, "test", "display", "connection")
    assert not PairHub.valid_message(display, "test", "controller", "connection")
    controller = {**hello("controller"), "type": "exhibition-control", "action": "stop"}
    assert PairHub.valid_message(controller, "test", "controller", "connection")
    assert not PairHub.valid_message({**controller, "connectionId": "forged"}, "test", "controller", "connection")
    assert not PairHub.valid_message({**controller, "sequence": 0}, "test", "controller", "connection")


def test_valid_ink_snapshot_is_accepted_only_from_controller():
    message = ink_message()
    assert PairHub.valid_message(message, "test", "controller", "connection")
    assert not PairHub.valid_message({**message, "sender": "display"}, "test", "controller", "connection")
    assert not PairHub.valid_message(ink_message(generation=True), "test", "controller", "connection")


@pytest.mark.parametrize("bad_value", [-0.1, 1.1, math.inf, math.nan, True, "0.5"])
def test_ink_rejects_invalid_coordinates_and_pressure(bad_value):
    ink = ink_message()["ink"]
    ink["strokes"][0][0]["x"] = bad_value
    assert not PairHub.valid_ink(ink)


def test_ink_enforces_aspect_revision_and_point_limits():
    valid = ink_message()["ink"]
    assert PairHub.valid_ink(valid)
    assert not PairHub.valid_ink({**valid, "aspectRatio": 0})
    assert not PairHub.valid_ink({**valid, "aspectRatio": math.inf})
    assert not PairHub.valid_ink({**valid, "revision": -1})
    too_many = {**valid, "strokes": [[{"x": 0.5, "y": 0.5, "pressure": 0.5}] * 12_001]}
    assert not PairHub.valid_ink(too_many)
