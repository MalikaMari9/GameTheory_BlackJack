import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import recv_event, recv_snapshot, redis_available


@pytest.mark.skipif(not redis_available(), reason="Redis not available")
def test_sync_replays_events(table_id: str) -> None:
    client = TestClient(app)
    with client.websocket_connect("/ws/blackjack") as ws1, client.websocket_connect(
        "/ws/blackjack"
    ) as ws2:
        ws1.send_json({"type": "HELLO", "nickname": "Alice"})
        ws1.receive_json()
        ws2.send_json({"type": "HELLO", "nickname": "Bob"})
        ws2.receive_json()

        ws1.send_json({"type": "JOIN_TABLE", "table_id": table_id})
        recv_snapshot(ws1)
        ws2.send_json({"type": "JOIN_TABLE", "table_id": table_id})
        recv_snapshot(ws2)

        ws1.send_json({"type": "READY_TOGGLE"})
        recv_snapshot(ws1)
        ws2.send_json({"type": "READY_TOGGLE"})
        recv_snapshot(ws2)

        ws1.send_json({"type": "START_SESSION"})
        recv_snapshot(ws1)

        # Trigger some events
        ws1.send_json(
            {
                "type": "PLACE_BET",
                "amount": 20,
                "request_id": f"bet-{uuid.uuid4()}",
            }
        )
        recv_snapshot(ws1)

        # Sync from beginning
        ws2.send_json({"type": "SYNC", "last_event_id": None})
        snap = recv_snapshot(ws2)
        assert snap["type"] == "SNAPSHOT"

        # Expect at least one EVENT after snapshot
        evt = recv_event(ws2, "BET_PLACED")
        assert "event_id" in evt
