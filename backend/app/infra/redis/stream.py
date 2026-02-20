import json
from typing import Any, Dict

from redis import Redis

from app.infra.redis import keys

EVENT_STREAM_MAXLEN = 2000
EVENT_SYNC_TAIL = 200

def append_event(
    redis: Redis, tid: str, event_type: str, session_id: str, round_id: int, payload: Dict[str, Any]
) -> str:
    fields = {
        "event_type": event_type,
        "session_id": session_id,
        "round_id": str(round_id),
        "payload": json.dumps(payload),
    }
    return redis.xadd(keys.table_events(tid), fields, maxlen=EVENT_STREAM_MAXLEN, approximate=True)


def read_events(
    redis: Redis, tid: str, last_event_id: str | None, count: int = 500
) -> list[dict]:
    if not last_event_id:
        events = redis.xrevrange(
            keys.table_events(tid), max="+", min="-", count=min(count, EVENT_SYNC_TAIL)
        )
        events.reverse()
        result = []
        for event_id, data in events:
            payload_raw = data.get("payload") or "{}"
            try:
                payload = json.loads(payload_raw)
            except Exception:
                payload = {}
            result.append(
                {
                    "event_id": event_id,
                    "type": data.get("event_type"),
                    "session_id": data.get("session_id"),
                    "round_id": int(data.get("round_id", "0") or 0),
                    "payload": payload,
                }
            )
        return result

    start = f"({last_event_id}"
    result = []
    while True:
        events = redis.xrange(keys.table_events(tid), min=start, max="+", count=count)
        if not events:
            break
        for event_id, data in events:
            payload_raw = data.get("payload") or "{}"
            try:
                payload = json.loads(payload_raw)
            except Exception:
                payload = {}
            result.append(
                {
                    "event_id": event_id,
                    "type": data.get("event_type"),
                    "session_id": data.get("session_id"),
                    "round_id": int(data.get("round_id", "0") or 0),
                    "payload": payload,
                }
            )
        start = f"({events[-1][0]}"
    return result
