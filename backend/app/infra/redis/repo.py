import json
from typing import Any, Dict, Optional

from redis import Redis

from app.config import settings
from app.infra.redis import keys
from app.utils.ids import new_id
from app.utils.time import utc_ms


def ensure_table(redis: Redis, tid: str) -> Dict[str, Any]:
    meta_key = keys.table_meta(tid)
    if redis.exists(meta_key):
        redis.sadd(keys.tables_set(), tid)
        return redis.hgetall(meta_key)

    meta = {
        "phase": "LOBBY",
        "session_id": new_id(),
        "round_id": 0,
        "turn_seat": 0,
        "bet_deadline_ts": 0,
        "vote_deadline_ts": 0,
        "pending_advance_ts": 0,
        "pending_advance_seat": 0,
        "pending_bust_announce_ts": 0,
        "pending_bust_seat": 0,
        "pending_bust_player_id": "",
        "pending_double_due_ts": 0,
        "pending_double_seat": 0,
        "pending_double_player_id": "",
        "pending_double_hand_id": "",
        "dealer_revealed": 0,
        "pause_until_ts": 0,
        "settle_pending": 0,
        "settle_collect_started": 0,
        "deal_pending": 0,
        "turn_start_due_ts": 0,
        "starting_bankroll": settings.starting_bankroll,
        "min_bet": settings.min_bet,
        "max_bet": settings.max_bet,
        "dealer_soft_17_rule": "",
        "shoe_decks": settings.shoe_decks,
        "reshuffle_when_remaining_pct": settings.reshuffle_when_remaining_pct,
        "reconnect_grace_seconds": settings.reconnect_grace_seconds,
        "pending_starting_bankroll": "",
        "pending_min_bet": "",
        "pending_max_bet": "",
        "pending_shoe_decks": "",
        "pending_reshuffle_when_remaining_pct": "",
    }
    redis.hset(meta_key, mapping=meta)
    redis.sadd(keys.tables_set(), tid)
    return meta


def get_meta(redis: Redis, tid: str) -> Dict[str, Any]:
    return redis.hgetall(keys.table_meta(tid))


def set_meta(redis: Redis, tid: str, updates: Dict[str, Any]) -> None:
    if not updates:
        return
    redis.hset(keys.table_meta(tid), mapping=updates)


def set_reconnect_token(redis: Redis, token: str, pid: str) -> None:
    redis.set(keys.reconnect_token(token), pid)


def get_reconnect_pid(redis: Redis, token: str) -> Optional[str]:
    return redis.get(keys.reconnect_token(token))


def upsert_player(
    redis: Redis,
    tid: str,
    pid: str,
    seat: int,
    nickname: str,
    reconnect_token: str,
) -> None:
    redis.sadd(keys.table_players(tid), pid)
    player_key = keys.table_player(tid, pid)
    if redis.exists(player_key):
        redis.hset(
            player_key,
            mapping={
                "seat": seat,
                "name": nickname,
                "reconnect_token": reconnect_token,
                "status": "active",
                "last_seen_ts": utc_ms(),
            },
        )
        return

    starting_bankroll = settings.starting_bankroll
    try:
        meta = redis.hgetall(keys.table_meta(tid))
        raw = meta.get("starting_bankroll")
        if raw not in (None, ""):
            starting_bankroll = int(raw)
    except Exception:
        pass

    redis.hset(
        player_key,
        mapping={
            "seat": seat,
            "name": nickname,
            "bankroll": starting_bankroll,
            "status": "active",
            "bet": 0,
            "bet_submitted": 0,
            "hand_ids": json.dumps([]),
            "reconnect_token": reconnect_token,
            "last_seen_ts": utc_ms(),
        },
    )


def update_last_seen(redis: Redis, tid: str, pid: str) -> None:
    redis.hset(keys.table_player(tid, pid), mapping={"last_seen_ts": utc_ms()})


def mark_disconnected(redis: Redis, tid: str, pid: str) -> None:
    redis.hset(
        keys.table_player(tid, pid),
        mapping={"status": "disconnected", "last_seen_ts": utc_ms()},
    )


def remove_player(redis: Redis, tid: str, pid: str) -> None:
    seats_key = keys.table_seats(tid)
    seat = redis.hget(seats_key, f"player:{pid}")
    player_key = keys.table_player(tid, pid)
    reconnect_token = redis.hget(player_key, "reconnect_token")
    if reconnect_token:
        redis.delete(keys.reconnect_token(reconnect_token))
    if seat:
        redis.hdel(seats_key, f"player:{pid}", f"seat:{seat}")
    redis.srem(keys.table_players(tid), pid)
    redis.srem(keys.table_ready(tid), pid)
    redis.delete(player_key)


def cleanup_disconnected(redis: Redis, tid: str, grace_seconds: int) -> int:
    players = get_all_players(redis, tid)
    now = utc_ms()
    removed = 0
    for pid, pdata in players.items():
        if pdata.get("status") != "disconnected":
            continue
        last_seen = int(pdata.get("last_seen_ts", "0") or 0)
        if now - last_seen > grace_seconds * 1000:
            remove_player(redis, tid, pid)
            removed += 1
    return removed


def get_seat_for_player(redis: Redis, tid: str, pid: str) -> Optional[int]:
    seat = redis.hget(keys.table_seats(tid), f"player:{pid}")
    return int(seat) if seat else None


def get_player_id_for_seat(redis: Redis, tid: str, seat: int) -> Optional[str]:
    if seat <= 0:
        return None
    pid = redis.hget(keys.table_seats(tid), f"seat:{seat}")
    return str(pid) if pid else None


def assign_seat(redis: Redis, tid: str, pid: str) -> int:
    seats_key = keys.table_seats(tid)
    for seat in range(1, settings.seat_count + 1):
        seat_key = f"seat:{seat}"
        if redis.hget(seats_key, seat_key):
            continue
        redis.hset(seats_key, mapping={seat_key: pid, f"player:{pid}": seat})
        return seat
    raise ValueError("No available seats")


def bind_seat(redis: Redis, tid: str, pid: str, seat: int) -> Optional[int]:
    if seat <= 0:
        return None
    seats_key = keys.table_seats(tid)
    seat_key = f"seat:{seat}"
    current = redis.hget(seats_key, seat_key)
    if current and current != pid:
        return None
    redis.hset(seats_key, mapping={seat_key: pid, f"player:{pid}": seat})
    return seat


def is_ready(redis: Redis, tid: str, pid: str) -> bool:
    return redis.sismember(keys.table_ready(tid), pid)


def set_ready(redis: Redis, tid: str, pid: str, ready: bool) -> None:
    if ready:
        redis.sadd(keys.table_ready(tid), pid)
    else:
        redis.srem(keys.table_ready(tid), pid)


def ready_count(redis: Redis, tid: str) -> int:
    return int(redis.scard(keys.table_ready(tid)))


def get_ready_players(redis: Redis, tid: str) -> set[str]:
    return set(redis.smembers(keys.table_ready(tid)))


def get_snapshot(redis: Redis, tid: str) -> Dict[str, Any]:
    meta = get_meta(redis, tid)
    seats = redis.hgetall(keys.table_seats(tid))
    players_set = redis.smembers(keys.table_players(tid))
    players = {pid: redis.hgetall(keys.table_player(tid, pid)) for pid in players_set}
    dealer_hand_id = meta.get("dealer_hand_id")
    dealer_hand = {}
    if dealer_hand_id:
        dealer_hand = redis.hgetall(keys.table_hand(tid, dealer_hand_id))
        phase = meta.get("phase")
        dealer_revealed = int(meta.get("dealer_revealed", "0") or 0)
        dealer_step = str(meta.get("dealer_step") or "")
        can_reveal_dealer = phase in {
            "SETTLE",
            "VOTE_CONTINUE",
            "SESSION_ENDED",
        } or (phase == "DEALER_TURN" and (dealer_revealed == 1 or dealer_step == "DRAW"))
        if dealer_hand and phase not in {
            "SETTLE",
            "VOTE_CONTINUE",
            "SESSION_ENDED",
        } and not can_reveal_dealer:
            raw = dealer_hand.get("cards")
            try:
                cards = json.loads(raw) if raw else []
            except Exception:
                cards = []
            public_cards = cards[:1]
            dealer_hand = {
                "cards": json.dumps(public_cards),
                "total": "",
                "is_soft": "",
                "face_down": 1,
            }
    return {
        "meta": meta,
        "seats": seats,
        "players": players,
        "dealer_hand": dealer_hand,
        "public_round_state": {},
    }


def mark_request(redis: Redis, tid: str, request_id: str, ttl_seconds: int = 120) -> bool:
    key = keys.table_request(tid, request_id)
    return bool(redis.set(key, "1", nx=True, ex=ttl_seconds))


def set_bet(redis: Redis, tid: str, pid: str, amount: int) -> None:
    redis.hset(keys.table_player(tid, pid), mapping={"bet": amount})


def set_bet_submitted(redis: Redis, tid: str, pid: str, submitted: bool) -> None:
    redis.hset(
        keys.table_player(tid, pid),
        mapping={"bet_submitted": int(submitted)},
    )


def adjust_bankroll(redis: Redis, tid: str, pid: str, delta: int) -> None:
    redis.hincrby(keys.table_player(tid, pid), "bankroll", delta)


def get_player(redis: Redis, tid: str, pid: str) -> Dict[str, Any]:
    return redis.hgetall(keys.table_player(tid, pid))


def get_all_players(redis: Redis, tid: str) -> Dict[str, Dict[str, Any]]:
    players_set = redis.smembers(keys.table_players(tid))
    return {pid: redis.hgetall(keys.table_player(tid, pid)) for pid in players_set}


def set_player_hand_ids(redis: Redis, tid: str, pid: str, hand_ids: list[str]) -> None:
    redis.hset(keys.table_player(tid, pid), mapping={"hand_ids": json.dumps(hand_ids)})


def clear_hands(redis: Redis, tid: str) -> None:
    players = get_all_players(redis, tid)
    for pid in players:
        redis.hset(
            keys.table_player(tid, pid),
            mapping={"hand_ids": json.dumps([])},
        )
    # clear dealer hand if present
    meta = get_meta(redis, tid)
    dealer_hand_id = meta.get("dealer_hand_id")
    if dealer_hand_id:
        redis.delete(keys.table_hand(tid, dealer_hand_id))
        set_meta(redis, tid, {"dealer_hand_id": ""})


def clear_bets(redis: Redis, tid: str) -> None:
    players = get_all_players(redis, tid)
    for pid in players:
        redis.hset(
            keys.table_player(tid, pid),
            mapping={"bet": 0, "bet_submitted": 0},
        )


def save_shoe(redis: Redis, tid: str, cards: list[str]) -> None:
    redis.set(keys.table_shoe(tid), json.dumps(cards))


def load_shoe(redis: Redis, tid: str) -> list[str]:
    raw = redis.get(keys.table_shoe(tid))
    if not raw:
        return []
    return json.loads(raw)


def set_shoe_meta(redis: Redis, tid: str, updates: Dict[str, Any]) -> None:
    if not updates:
        return
    redis.hset(keys.table_shoe_meta(tid), mapping=updates)


def get_shoe_meta(redis: Redis, tid: str) -> Dict[str, Any]:
    return redis.hgetall(keys.table_shoe_meta(tid))


def save_hand(redis: Redis, tid: str, hand_id: str, cards: list[str], total: int, is_soft: bool) -> None:
    redis.hset(
        keys.table_hand(tid, hand_id),
        mapping={
            "cards": json.dumps(cards),
            "total": total,
            "is_soft": int(is_soft),
        },
    )


def load_hand_cards(redis: Redis, tid: str, hand_id: str) -> list[str]:
    raw = redis.hget(keys.table_hand(tid, hand_id), "cards")
    if not raw:
        return []
    return json.loads(raw)


def cast_vote(redis: Redis, tid: str, round_id: int, pid: str, vote: str) -> None:
    redis.hset(keys.table_vote(tid, round_id), mapping={pid: vote})


def get_votes(redis: Redis, tid: str, round_id: int) -> Dict[str, str]:
    return redis.hgetall(keys.table_vote(tid, round_id))


def clear_votes(redis: Redis, tid: str, round_id: int) -> None:
    redis.delete(keys.table_vote(tid, round_id))


def clear_table(redis: Redis, tid: str) -> None:
    # Cleanup player + hand keys before removing table metadata.
    meta = get_meta(redis, tid)
    round_id = int(meta.get("round_id", "0") or 0)
    dealer_hand_id = meta.get("dealer_hand_id")

    players = redis.smembers(keys.table_players(tid))
    for pid in players:
        player_key = keys.table_player(tid, pid)
        hand_ids_raw = redis.hget(player_key, "hand_ids")
        if hand_ids_raw:
            try:
                hand_ids = json.loads(hand_ids_raw)
            except Exception:
                hand_ids = []
            for hand_id in hand_ids:
                redis.delete(keys.table_hand(tid, hand_id))
        remove_player(redis, tid, pid)

    if dealer_hand_id:
        redis.delete(keys.table_hand(tid, dealer_hand_id))

    redis.delete(
        keys.table_meta(tid),
        keys.table_players(tid),
        keys.table_seats(tid),
        keys.table_ready(tid),
        keys.table_shoe(tid),
        keys.table_shoe_meta(tid),
        keys.table_events(tid),
        keys.table_vote(tid, round_id),
    )
    redis.srem(keys.tables_set(), tid)


def get_tables(redis: Redis) -> list[str]:
    return list(redis.smembers(keys.tables_set()))
