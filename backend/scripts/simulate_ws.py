import asyncio
import json
from typing import Any, Dict

import websockets


WS_URL = "ws://127.0.0.1:8000/ws/blackjack"
TABLE_ID = "default"


async def send_and_recv(ws: websockets.WebSocketClientProtocol, payload: Dict[str, Any]) -> Dict[str, Any]:
    await ws.send(json.dumps(payload))
    raw = await ws.recv()
    return json.loads(raw)


async def run_client(nickname: str) -> Dict[str, Any]:
    async with websockets.connect(WS_URL) as ws:
        welcome = await send_and_recv(ws, {"type": "HELLO", "nickname": nickname})
        snapshot = await send_and_recv(ws, {"type": "JOIN_TABLE", "table_id": TABLE_ID})
        ready = await send_and_recv(ws, {"type": "READY_TOGGLE"})
        return {
            "welcome": welcome,
            "snapshot": snapshot,
            "ready": ready,
        }


async def main() -> None:
    # Connect two clients, then start session from the first client.
    async with websockets.connect(WS_URL) as ws1, websockets.connect(WS_URL) as ws2:
        w1 = await send_and_recv(ws1, {"type": "HELLO", "nickname": "Alice"})
        w2 = await send_and_recv(ws2, {"type": "HELLO", "nickname": "Bob"})

        s1 = await send_and_recv(ws1, {"type": "JOIN_TABLE", "table_id": TABLE_ID})
        s2 = await send_and_recv(ws2, {"type": "JOIN_TABLE", "table_id": TABLE_ID})

        r1 = await send_and_recv(ws1, {"type": "READY_TOGGLE"})
        r2 = await send_and_recv(ws2, {"type": "READY_TOGGLE"})

        start = await send_and_recv(ws1, {"type": "START_SESSION"})

        bet1 = await send_and_recv(
            ws1, {"type": "PLACE_BET", "amount": 20, "request_id": "bet-1"}
        )
        bet2 = await send_and_recv(
            ws2, {"type": "PLACE_BET", "amount": 20, "request_id": "bet-2"}
        )

        action1 = await send_and_recv(
            ws1, {"type": "ACTION", "action": "stand", "request_id": "act-1"}
        )
        action2 = await send_and_recv(
            ws2, {"type": "ACTION", "action": "stand", "request_id": "act-2"}
        )

        print("WELCOME 1:", w1)
        print("WELCOME 2:", w2)
        print("SNAPSHOT 1:", s1)
        print("SNAPSHOT 2:", s2)
        print("READY 1:", r1)
        print("READY 2:", r2)
        print("START:", start)
        print("BET 1:", bet1)
        print("BET 2:", bet2)
        print("ACTION 1:", action1)
        print("ACTION 2:", action2)


if __name__ == "__main__":
    asyncio.run(main())
