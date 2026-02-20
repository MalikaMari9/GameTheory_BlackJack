import time
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.infra.redis.client import get_redis
from app.infra.redis import repo
from app.services.round_service import finalize_bets
from tests.conftest import recv_snapshot, redis_available


@pytest.mark.skipif(not redis_available(), reason="Redis not available")
def test_bet_timeout_auto_deal(table_id: str) -> None:
    client = TestClient(app)
    redis = get_redis()

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

        # Only one player bets
        ws1.send_json(
            {
                "type": "PLACE_BET",
                "amount": 20,
                "request_id": f"bet-{uuid.uuid4()}",
            }
        )
        recv_snapshot(ws1)

    # Force bet timeout and finalize
    repo.set_meta(
        redis,
        table_id,
        {"phase": "WAITING_FOR_BETS", "bet_deadline_ts": int(time.time() * 1000) - 1},
    )
    snapshot = finalize_bets(redis, table_id, force_timeout=True)
    assert snapshot["meta"]["phase"] in {"DEAL_INITIAL", "PLAYER_TURNS"}
