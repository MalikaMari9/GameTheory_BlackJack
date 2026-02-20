from typing import Any, Callable, Dict

from redis import Redis

from app.config import settings
from app.infra.redis.locks import table_lock
from app.infra.redis import repo
from app.utils.ids import new_id
from app.utils.time import utc_ms
from app.services.round_service import apply_pending_config

def _active_players(players: Dict[str, Dict[str, str]]) -> Dict[str, Dict[str, str]]:
    return {pid: pdata for pid, pdata in players.items() if pdata.get("status") != "disconnected"}


def _all_active_ready(redis: Redis, tid: str, players: Dict[str, Dict[str, str]]) -> bool:
    if not players:
        return False
    for pid in players:
        if not repo.is_ready(redis, tid, pid):
            return False
    return True


def _start_session_locked(redis: Redis, tid: str) -> Dict:
    now = utc_ms()
    apply_pending_config(redis, tid)
    bet_deadline_ts = now + settings.bet_time_seconds * 1000 if settings.bet_time_seconds > 0 else 0
    repo.clear_bets(redis, tid)
    repo.clear_hands(redis, tid)
    repo.set_meta(
        redis,
        tid,
        {
            "phase": "WAITING_FOR_BETS",
            "session_id": new_id(),
            "round_id": 1,
            "session_started_ts": now,
            "bet_deadline_ts": bet_deadline_ts,
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
        },
    )
    return repo.get_snapshot(redis, tid)


def _emit_announcement(
    redis: Redis,
    tid: str,
    emit: Callable[[str, Dict], None] | None,
    title: str,
    tone: str = "neutral",
    duration_ms: int = 3000,
) -> None:
    if not emit:
        return
    emit(
        "ANNOUNCEMENT",
        {
            "title": title,
            "variant": "reveal",
            "tone": tone,
            "duration_ms": duration_ms,
        },
    )
    _pause_for(redis, tid, duration_ms)


def _pause_for(redis: Redis, tid: str, duration_ms: int) -> None:
    now = utc_ms()
    meta = repo.get_meta(redis, tid)
    current = int(meta.get("pause_until_ts", "0") or 0)
    base = current if current > now else now
    repo.set_meta(redis, tid, {"pause_until_ts": base + duration_ms})


def handle_hello(redis: Redis, nickname: str, reconnect_token: str | None) -> Dict[str, str]:
    if reconnect_token:
        pid = repo.get_reconnect_pid(redis, reconnect_token)
        if pid:
            return {"player_id": pid, "reconnect_token": reconnect_token}

    player_id = new_id()
    reconnect_token = new_id()
    repo.set_reconnect_token(redis, reconnect_token, player_id)
    return {"player_id": player_id, "reconnect_token": reconnect_token}


def handle_join_table(
    redis: Redis,
    tid: str,
    player_id: str,
    nickname: str,
    reconnect_token: str,
    emit: Callable[[str, Dict], None] | None = None,
) -> Dict:
    started = False
    with table_lock(redis, tid):
        meta = repo.ensure_table(redis, tid)
        existing = repo.get_player(redis, tid, player_id)
        if meta.get("phase") != "LOBBY" and not settings.allow_join_during_session:
            seat = repo.get_seat_for_player(redis, tid, player_id)
            if seat is None and not existing:
                raise ValueError("Join denied: session already in progress")
        seat = repo.get_seat_for_player(redis, tid, player_id)
        if seat is None:
            preferred = int(existing.get("seat", "0") or 0) if existing else 0
            if preferred:
                seat = repo.bind_seat(redis, tid, player_id, preferred)
            if seat is None:
                seat = repo.assign_seat(redis, tid, player_id)
        repo.upsert_player(redis, tid, player_id, seat, nickname, reconnect_token)
        if meta.get("phase") == "LOBBY":
            players = repo.get_all_players(redis, tid)
            active = _active_players(players)
            if (
                len(active) >= settings.min_players_to_start
                and _all_active_ready(redis, tid, active)
            ):
                started = True
                snapshot = _start_session_locked(redis, tid)
            else:
                snapshot = repo.get_snapshot(redis, tid)
        else:
            snapshot = repo.get_snapshot(redis, tid)
    if emit:
        emit(
            "PLAYER_JOINED",
            {"player_id": player_id, "seat": seat, "name": nickname},
        )
        if started:
            emit("SESSION_STARTED", {"table_id": tid})
            _emit_announcement(redis, tid, emit, "GAME BEGIN", tone="neutral")
            emit("PHASE_CHANGED", {"phase": "WAITING_FOR_BETS"})
    return snapshot


def handle_ready_toggle(
    redis: Redis, tid: str, player_id: str, emit: Callable[[str, Dict], None] | None = None
) -> Dict:
    started = False
    with table_lock(redis, tid):
        meta = repo.get_meta(redis, tid)
        if meta.get("phase") != "LOBBY":
            raise ValueError("Ready toggle only allowed in lobby")
        ready = repo.is_ready(redis, tid, player_id)
        repo.set_ready(redis, tid, player_id, not ready)
        players = repo.get_all_players(redis, tid)
        active = _active_players(players)
        if (
            len(active) >= settings.min_players_to_start
            and _all_active_ready(redis, tid, active)
        ):
            started = True
            snapshot = _start_session_locked(redis, tid)
        else:
            snapshot = repo.get_snapshot(redis, tid)
    if emit:
        seat = repo.get_seat_for_player(redis, tid, player_id)
        emit("READY_CHANGED", {"player_id": player_id, "seat": seat, "ready": not ready})
        if started:
            emit("SESSION_STARTED", {"table_id": tid})
            _emit_announcement(redis, tid, emit, "GAME BEGIN", tone="neutral")
            emit("PHASE_CHANGED", {"phase": "WAITING_FOR_BETS"})
    return snapshot


def handle_start_session(
    redis: Redis, tid: str, emit: Callable[[str, Dict], None] | None = None
) -> Dict:
    with table_lock(redis, tid):
        meta = repo.get_meta(redis, tid)
        if meta.get("phase") != "LOBBY":
            raise ValueError("Session already started")
        players = repo.get_all_players(redis, tid)
        active = _active_players(players)
        if len(active) < settings.min_players_to_start:
            raise ValueError("Not enough players to start session")
        if not _all_active_ready(redis, tid, active):
            raise ValueError("All active players must be ready")
        snapshot = _start_session_locked(redis, tid)
    if emit:
        emit("SESSION_STARTED", {"table_id": tid})
        _emit_announcement(redis, tid, emit, "GAME BEGIN", tone="neutral")
        emit("PHASE_CHANGED", {"phase": "WAITING_FOR_BETS"})
    return snapshot


def handle_admin_config(
    redis: Redis,
    tid: str,
    config: Dict[str, Any],
    emit: Callable[[str, Dict], None] | None = None,
) -> Dict:
    with table_lock(redis, tid):
        meta = repo.get_meta(redis, tid)
        updates: Dict[str, Any] = {}

        def set_pending(key: str, value: Any) -> None:
            updates[f"pending_{key}"] = value

        starting_bankroll = config.get("starting_bankroll")
        if starting_bankroll is not None:
            if starting_bankroll < 0:
                raise ValueError("Starting bankroll must be >= 0")
            set_pending("starting_bankroll", int(starting_bankroll))

        min_bet = config.get("min_bet")
        if min_bet is not None:
            if min_bet < 0:
                raise ValueError("Min bet must be >= 0")
            set_pending("min_bet", int(min_bet))

        max_bet = config.get("max_bet")
        if max_bet is not None:
            if max_bet < 0:
                raise ValueError("Max bet must be >= 0")
            set_pending("max_bet", int(max_bet))

        shoe_decks = config.get("shoe_decks")
        if shoe_decks is not None:
            if shoe_decks < 1:
                raise ValueError("Shoe decks must be >= 1")
            set_pending("shoe_decks", int(shoe_decks))

        reshuffle_pct = config.get("reshuffle_when_remaining_pct")
        if reshuffle_pct is not None:
            if reshuffle_pct <= 0 or reshuffle_pct >= 1:
                raise ValueError("Reshuffle pct must be between 0 and 1")
            set_pending("reshuffle_when_remaining_pct", float(reshuffle_pct))

        effective_min = (
            int(min_bet)
            if min_bet is not None
            else int(meta.get("min_bet") or settings.min_bet)
        )
        effective_max = (
            int(max_bet)
            if max_bet is not None
            else int(meta.get("max_bet") or settings.max_bet)
        )
        if effective_min > effective_max:
            raise ValueError("Min bet cannot exceed max bet")

        if updates:
            repo.set_meta(redis, tid, updates)
    if emit:
        emit("ADMIN_CONFIG_UPDATED", {"pending": updates})
    return repo.get_snapshot(redis, tid)
