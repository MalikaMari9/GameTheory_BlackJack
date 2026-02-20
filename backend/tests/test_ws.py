import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import redis_available


@pytest.mark.skipif(not redis_available(), reason="Redis not available")
def test_ws_hello_welcome() -> None:
    client = TestClient(app)
    with client.websocket_connect("/ws/blackjack") as ws:
        ws.send_json({"type": "HELLO", "nickname": "tester"})
        msg = ws.receive_json()
        assert msg["type"] == "WELCOME"
        assert "player_id" in msg
        assert "reconnect_token" in msg
