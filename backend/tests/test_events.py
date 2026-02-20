import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.infra.redis.client import get_redis
from app.infra.redis import keys
from tests.conftest import recv_snapshot, redis_available


@pytest.mark.skipif(not redis_available(), reason="Redis not available")
def test_event_broadcast(table_id: str) -> None:
    client = TestClient(app)
    redis = get_redis()

    def event_types():
        events = redis.xrange(keys.table_events(table_id))
        return [e[1].get("event_type") for e in events]

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
        assert "SESSION_STARTED" in event_types()

        ws1.send_json(
            {
                "type": "PLACE_BET",
                "amount": 20,
                "request_id": f"bet-{uuid.uuid4()}",
            }
        )
        recv_snapshot(ws1)
        assert "BET_PLACED" in event_types()

        ws2.send_json(
            {
                "type": "PLACE_BET",
                "amount": 20,
                "request_id": f"bet-{uuid.uuid4()}",
            }
        )
        recv_snapshot(ws2)
        assert "CARD_DEALT" in event_types()

        ws1.send_json(
            {"type": "ACTION", "action": "stand", "request_id": f"act-{uuid.uuid4()}"}
        )
        recv_snapshot(ws1)
        ws2.send_json(
            {"type": "ACTION", "action": "stand", "request_id": f"act-{uuid.uuid4()}"}
        )
        recv_snapshot(ws2)

        types = event_types()
        assert "DEALER_ACTION" in types
        assert "PAYOUT" in types
        assert "VOTE_STARTED" in types

        ws1.send_json(
            {
                "type": "VOTE_CONTINUE",
                "vote": "yes",
                "request_id": f"vote-{uuid.uuid4()}",
            }
        )
        recv_snapshot(ws1)
        ws2.send_json(
            {
                "type": "VOTE_CONTINUE",
                "vote": "yes",
                "request_id": f"vote-{uuid.uuid4()}",
            }
        )
        recv_snapshot(ws2)
        assert "VOTE_RESULT" in event_types()
