import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import recv_snapshot, redis_available


@pytest.mark.skipif(not redis_available(), reason="Redis not available")
def test_round_flow_bet_and_actions(table_id: str) -> None:
    client = TestClient(app)
    with client.websocket_connect("/ws/blackjack") as ws1, client.websocket_connect(
        "/ws/blackjack"
    ) as ws2:
        ws1.send_json({"type": "HELLO", "nickname": "Alice"})
        w1 = ws1.receive_json()
        ws2.send_json({"type": "HELLO", "nickname": "Bob"})
        w2 = ws2.receive_json()
        assert w1["type"] == "WELCOME"
        assert w2["type"] == "WELCOME"

        ws1.send_json({"type": "JOIN_TABLE", "table_id": table_id})
        s1 = recv_snapshot(ws1)
        ws2.send_json({"type": "JOIN_TABLE", "table_id": table_id})
        s2 = recv_snapshot(ws2)
        assert s1["type"] == "SNAPSHOT"
        assert s2["type"] == "SNAPSHOT"

        ws1.send_json({"type": "READY_TOGGLE"})
        recv_snapshot(ws1)
        ws2.send_json({"type": "READY_TOGGLE"})
        recv_snapshot(ws2)

        ws1.send_json({"type": "START_SESSION"})
        start = recv_snapshot(ws1)
        assert start["meta"]["phase"] == "WAITING_FOR_BETS"

        ws1.send_json(
            {
                "type": "PLACE_BET",
                "amount": 20,
                "request_id": f"bet-{uuid.uuid4()}",
            }
        )
        bet1 = recv_snapshot(ws1)
        assert bet1["meta"]["phase"] == "WAITING_FOR_BETS"

        ws2.send_json(
            {
                "type": "PLACE_BET",
                "amount": 20,
                "request_id": f"bet-{uuid.uuid4()}",
            }
        )
        bet2 = recv_snapshot(ws2)
        assert bet2["meta"]["phase"] == "PLAYER_TURNS"
        assert bet2["meta"]["turn_seat"] == "1"

        # Validate bankroll changed for both players
        players = bet2["players"]
        bankrolls = [int(p["bankroll"]) for p in players.values()]
        assert bankrolls.count(980) == 2

        ws1.send_json(
            {"type": "ACTION", "action": "stand", "request_id": f"act-{uuid.uuid4()}"}
        )
        a1 = recv_snapshot(ws1)
        assert a1["meta"]["turn_seat"] == "2"

        ws2.send_json(
            {"type": "ACTION", "action": "stand", "request_id": f"act-{uuid.uuid4()}"}
        )
        a2 = recv_snapshot(ws2)
        assert a2["meta"]["phase"] == "VOTE_CONTINUE"

        ws1.send_json(
            {
                "type": "VOTE_CONTINUE",
                "vote": "yes",
                "request_id": f"vote-{uuid.uuid4()}",
            }
        )
        v1 = recv_snapshot(ws1)
        assert v1["meta"]["phase"] == "VOTE_CONTINUE"

        ws2.send_json(
            {
                "type": "VOTE_CONTINUE",
                "vote": "yes",
                "request_id": f"vote-{uuid.uuid4()}",
            }
        )
        v2 = recv_snapshot(ws2)
        assert v2["meta"]["phase"] == "WAITING_FOR_BETS"
