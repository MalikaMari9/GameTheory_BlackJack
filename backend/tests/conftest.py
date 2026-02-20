import uuid

import pytest
from redis import Redis


def redis_available() -> bool:
    try:
        Redis.from_url("redis://localhost:6379/0").ping()
        return True
    except Exception:
        return False


@pytest.fixture
def table_id() -> str:
    return f"test-{uuid.uuid4()}"


def recv_snapshot(ws):
    while True:
        msg = ws.receive_json()
        if msg.get("type") == "SNAPSHOT":
            return msg


def recv_event(ws, event_type: str, max_messages: int = 50):
    for _ in range(max_messages):
        msg = ws.receive_json()
        if msg.get("event_id") and msg.get("type") == event_type:
            return msg
    raise AssertionError(f"Did not receive EVENT {event_type}")
