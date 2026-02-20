import json
import random
from typing import Any, Callable, Dict, List, Tuple

from redis import Redis

from app.config import settings
from app.domain.rules.blackjack_rules import hand_value, new_shoe
from app.infra.redis import repo
from app.infra.redis.locks import table_lock
from app.utils.ids import new_id
from app.utils.time import utc_ms

DEAL_GAP_MS = 320
DEAL_SHUFFLE_MS = 1500
DEALER_GAP_MS = 800
DEALER_REVEAL_MS = 1000
DEALER_STEP_MS = 800
DEALER_ANIM_DELAY_MS = 150
DEAL_ANIM_MS = 560
BET_TO_DEAL_PAUSE_MS = 900
CHIPS_COLLECT_MS = 700
DOUBLE_ANNOUNCE_MS = 1000
BUST_ANNOUNCE_MS = 1400
BUST_REVEAL_DELAY_MS = DEAL_GAP_MS + DEAL_ANIM_MS

CONFIG_FIELDS = [
    "starting_bankroll",
    "min_bet",
    "max_bet",
    "shoe_decks",
    "reshuffle_when_remaining_pct",
]

def _meta_int(meta: Dict[str, Any], key: str, default: int) -> int:
    try:
        raw = meta.get(key)
        return int(raw) if raw not in (None, "") else default
    except Exception:
        return default


def _meta_float(meta: Dict[str, Any], key: str, default: float) -> float:
    try:
        raw = meta.get(key)
        return float(raw) if raw not in (None, "") else default
    except Exception:
        return default


def apply_pending_config(redis: Redis, tid: str) -> None:
    meta = repo.get_meta(redis, tid)
    updates: Dict[str, Any] = {}
    for key in CONFIG_FIELDS:
        pending_key = f"pending_{key}"
        pending_val = meta.get(pending_key)
        if pending_val is None or pending_val == "":
            continue
        updates[key] = pending_val
        updates[pending_key] = ""
    if updates:
        repo.set_meta(redis, tid, updates)


def _emit_announcement(
    redis: Redis,
    tid: str,
    emit: Callable[[str, Dict], None] | None,
    title: str,
    tone: str = "neutral",
    duration_ms: int = 3000,
    subtitle: str | None = None,
    target_seat: int | None = None,
) -> None:
    if not emit:
        return
    payload: Dict[str, Any] = {
        "title": title,
        "variant": "reveal",
        "tone": tone,
        "duration_ms": duration_ms,
    }
    if subtitle:
        payload["subtitle"] = subtitle
    if target_seat and int(target_seat) > 0:
        payload["target_seat"] = int(target_seat)
    emit("ANNOUNCEMENT", payload)
    _pause_for(redis, tid, duration_ms)


def _pause_for(redis: Redis, tid: str, duration_ms: int) -> None:
    now = utc_ms()
    meta = repo.get_meta(redis, tid)
    current = int(meta.get("pause_until_ts", "0") or 0)
    base = current if current > now else now
    repo.set_meta(redis, tid, {"pause_until_ts": base + duration_ms})


def _is_paused(meta: Dict[str, Any]) -> bool:
    try:
        until_ts = int(meta.get("pause_until_ts", "0") or 0)
    except Exception:
        until_ts = 0
    return until_ts > utc_ms()


def _seat_display_name(redis: Redis, tid: str, seat: int) -> str:
    if seat <= 0:
        return "PLAYER"
    pid = repo.get_player_id_for_seat(redis, tid, seat)
    if not pid:
        return f"PLAYER {seat}"
    pdata = repo.get_player(redis, tid, pid)
    name = str(pdata.get("name") or "").strip()
    if not name:
        return f"PLAYER {seat}"
    return name.upper()


def _betting_players(players: Dict[str, Dict[str, str]]) -> List[Tuple[int, str]]:
    seats: List[Tuple[int, str]] = []
    for pid, pdata in players.items():
        status = pdata.get("status") or "active"
        if status != "active":
            continue
        bet = int(pdata.get("bet", "0") or 0)
        if bet <= 0:
            continue
        seat = int(pdata.get("seat", "0") or 0)
        if seat:
            seats.append((seat, pid))
    return sorted(seats, key=lambda x: x[0])


def _eligible_to_bet(pdata: Dict[str, str], min_bet: int) -> bool:
    bankroll = int(pdata.get("bankroll", "0") or 0)
    status = pdata.get("status") or "active"
    return status == "active" and bankroll >= min_bet


def _ensure_shoe(redis: Redis, tid: str) -> None:
    meta = repo.get_meta(redis, tid)
    shoe_decks = _meta_int(meta, "shoe_decks", settings.shoe_decks)
    reshuffle_pct = _meta_float(
        meta, "reshuffle_when_remaining_pct", settings.reshuffle_when_remaining_pct
    )
    shoe = repo.load_shoe(redis, tid)
    if not shoe:
        shoe = new_shoe(shoe_decks)
        repo.save_shoe(redis, tid, shoe)
        repo.set_shoe_meta(
            redis,
            tid,
            {
                "decks": shoe_decks,
                "cut_index": int(len(shoe) * reshuffle_pct),
                "needs_shuffle": 0,
            },
        )
        return

    meta = repo.get_shoe_meta(redis, tid)
    cut_index = int(meta.get("cut_index", 0) or 0)
    if len(shoe) <= cut_index:
        shoe = new_shoe(shoe_decks)
        repo.save_shoe(redis, tid, shoe)
        repo.set_shoe_meta(
            redis,
            tid,
            {
                "decks": shoe_decks,
                "cut_index": int(len(shoe) * reshuffle_pct),
                "needs_shuffle": 0,
            },
        )


def _draw_card(redis: Redis, tid: str) -> str:
    shoe = repo.load_shoe(redis, tid)
    if not shoe:
        _ensure_shoe(redis, tid)
        shoe = repo.load_shoe(redis, tid)
    card = shoe.pop()
    repo.save_shoe(redis, tid, shoe)
    return card


def _set_hand(redis: Redis, tid: str, hand_id: str, cards: List[str]) -> None:
    total, is_soft = hand_value(cards)
    repo.save_hand(redis, tid, hand_id, cards, total, is_soft)


def _emit(emit: Callable[[str, Dict], None] | None, event_type: str, payload: Dict) -> None:
    if emit:
        emit(event_type, payload)


def handle_place_bet(
    redis: Redis,
    tid: str,
    pid: str,
    amount: int,
    request_id: str,
    emit: Callable[[str, Dict], None] | None = None,
) -> Dict:
    with table_lock(redis, tid):
        meta = repo.get_meta(redis, tid)
        if meta.get("phase") != "WAITING_FOR_BETS":
            raise ValueError("Not accepting bets in current phase")

        if not repo.mark_request(redis, tid, request_id):
            return repo.get_snapshot(redis, tid)

        deadline = int(meta.get("bet_deadline_ts", "0") or 0)
        now = utc_ms()
        if deadline and now > deadline:
            # betting closed, advance to deal if possible
            return _finalize_bets_and_deal(redis, tid, emit)

        player = repo.get_player(redis, tid, pid)
        if not player:
            raise ValueError("Unknown player")

        min_bet = _meta_int(meta, "min_bet", settings.min_bet)
        max_bet = _meta_int(meta, "max_bet", settings.max_bet)

        if amount != 0:
            if not _eligible_to_bet(player, min_bet):
                raise ValueError("Insufficient bankroll to bet")
            if amount < min_bet or amount > max_bet:
                raise ValueError("Bet amount out of bounds")

        current_bet = int(player.get("bet", "0") or 0)
        if current_bet > 0:
            return repo.get_snapshot(redis, tid)

        if amount > 0:
            repo.adjust_bankroll(redis, tid, pid, -amount)
        repo.set_bet(redis, tid, pid, amount)
        repo.set_bet_submitted(redis, tid, pid, True)
        repo.update_last_seen(redis, tid, pid)
        seat = repo.get_seat_for_player(redis, tid, pid)
        _emit(emit, "BET_PLACED", {"player_id": pid, "seat": seat, "amount": amount})

        return _maybe_advance_after_bets(redis, tid, emit)


def finalize_bets(
    redis: Redis,
    tid: str,
    force_timeout: bool,
    emit: Callable[[str, Dict], None] | None = None,
) -> Dict:
    with table_lock(redis, tid):
        meta = repo.get_meta(redis, tid)
        if _is_paused(meta):
            return repo.get_snapshot(redis, tid)
        if meta.get("phase") != "WAITING_FOR_BETS":
            return repo.get_snapshot(redis, tid)
        deadline = int(meta.get("bet_deadline_ts", "0") or 0)
        now = utc_ms()
        if not force_timeout and deadline and now <= deadline:
            return repo.get_snapshot(redis, tid)
        if not deadline:
            return repo.get_snapshot(redis, tid)
        return _finalize_bets_and_deal(redis, tid, emit)


def _maybe_advance_after_bets(
    redis: Redis, tid: str, emit: Callable[[str, Dict], None] | None = None
) -> Dict:
    meta = repo.get_meta(redis, tid)
    if _is_paused(meta):
        repo.set_meta(redis, tid, {"deal_pending": 1})
        return repo.get_snapshot(redis, tid)
    min_bet = _meta_int(meta, "min_bet", settings.min_bet)
    players = repo.get_all_players(redis, tid)
    for pdata in players.values():
        if not _eligible_to_bet(pdata, min_bet):
            continue
        if int(pdata.get("bet_submitted", "0") or 0) == 0:
            return repo.get_snapshot(redis, tid)
    # Let client-side chip drop animation settle before initial deal starts.
    _pause_for(redis, tid, BET_TO_DEAL_PAUSE_MS)
    repo.set_meta(redis, tid, {"deal_pending": 1})
    return repo.get_snapshot(redis, tid)


def _finalize_bets_and_deal(
    redis: Redis, tid: str, emit: Callable[[str, Dict], None] | None = None
) -> Dict:
    meta = repo.get_meta(redis, tid)
    if _is_paused(meta):
        repo.set_meta(redis, tid, {"deal_pending": 1})
        return repo.get_snapshot(redis, tid)
    min_bet = _meta_int(meta, "min_bet", settings.min_bet)
    players = repo.get_all_players(redis, tid)
    # players who didn't bet are considered sitting out
    no_bet_behavior = (settings.no_bet_behavior or "SIT_OUT_ROUND").upper()
    for pid, pdata in players.items():
        if not _eligible_to_bet(pdata, min_bet):
            continue
        if int(pdata.get("bet_submitted", "0") or 0) == 0:
            if no_bet_behavior == "AUTO_MIN_BET":
                bankroll = int(pdata.get("bankroll", "0") or 0)
                if bankroll >= min_bet:
                    repo.adjust_bankroll(redis, tid, pid, -min_bet)
                    repo.set_bet(redis, tid, pid, min_bet)
                    repo.set_bet_submitted(redis, tid, pid, True)
                    seat = repo.get_seat_for_player(redis, tid, pid)
                    _emit(
                        emit,
                        "BET_PLACED",
                        {"player_id": pid, "seat": seat, "amount": min_bet},
                    )
                    continue

            repo.set_bet(redis, tid, pid, 0)
            repo.set_bet_submitted(redis, tid, pid, True)
    return deal_initial(redis, tid, emit)


def advance_deal_pending(
    redis: Redis, tid: str, emit: Callable[[str, Dict], None] | None = None
) -> Dict:
    with table_lock(redis, tid):
        meta = repo.get_meta(redis, tid)
        if meta.get("phase") != "WAITING_FOR_BETS":
            return repo.get_snapshot(redis, tid)
        if int(meta.get("deal_pending", "0") or 0) == 0:
            return repo.get_snapshot(redis, tid)
        if _is_paused(meta):
            return repo.get_snapshot(redis, tid)
        repo.set_meta(redis, tid, {"deal_pending": 0})
        return _finalize_bets_and_deal(redis, tid, emit)


def advance_turn_start(
    redis: Redis, tid: str, emit: Callable[[str, Dict], None] | None = None
) -> Dict:
    with table_lock(redis, tid):
        meta = repo.get_meta(redis, tid)
        if meta.get("phase") != "DEAL_INITIAL":
            return repo.get_snapshot(redis, tid)
        due_ts = int(meta.get("turn_start_due_ts", "0") or 0)
        if not due_ts:
            return repo.get_snapshot(redis, tid)
        if _is_paused(meta):
            return repo.get_snapshot(redis, tid)
        if utc_ms() < due_ts:
            return repo.get_snapshot(redis, tid)

        players = repo.get_all_players(redis, tid)
        betting_seats = _betting_players(players)
        if not betting_seats:
            repo.set_meta(redis, tid, {"turn_start_due_ts": 0})
            return _dealer_turn_and_settle(redis, tid, emit)

        first_seat = int(betting_seats[0][0] or 0)
        repo.set_meta(
            redis,
            tid,
            {
                "phase": "PLAYER_TURNS",
                "turn_seat": first_seat,
                "turn_start_due_ts": 0,
            },
        )
        _emit(emit, "PHASE_CHANGED", {"phase": "PLAYER_TURNS"})
        _emit(emit, "TURN_STARTED", {"seat": first_seat})
        _emit_announcement(redis, tid, emit, f"{_seat_display_name(redis, tid, first_seat)}'S TURN")
        return repo.get_snapshot(redis, tid)


def deal_initial(
    redis: Redis, tid: str, emit: Callable[[str, Dict], None] | None = None
) -> Dict:
    _ensure_shoe(redis, tid)
    repo.clear_hands(redis, tid)
    repo.set_meta(
        redis,
        tid,
        {
            "phase": "DEAL_INITIAL",
            "dealer_revealed": 0,
            "pending_bust_announce_ts": 0,
            "pending_bust_seat": 0,
            "pending_bust_player_id": "",
        },
    )
    _emit(emit, "PHASE_CHANGED", {"phase": "DEAL_INITIAL"})

    mode = (settings.dealer_soft_17_mode or "RANDOM_PER_ROUND").upper()
    if mode in {"S17", "H17"}:
        dealer_rule = mode
    else:
        dealer_rule = random.choice(["S17", "H17"])
    repo.set_meta(redis, tid, {"dealer_soft_17_rule": dealer_rule})
    _emit(emit, "ROUND_STARTED", {"dealer_soft_17_rule": dealer_rule})

    players = repo.get_all_players(redis, tid)
    betting_seats = _betting_players(players)
    if not betting_seats:
        if settings.auto_end_if_no_active_bettors:
            repo.set_meta(redis, tid, {"phase": "SESSION_ENDED"})
            _emit(emit, "PHASE_CHANGED", {"phase": "SESSION_ENDED"})
            _emit(emit, "SESSION_ENDED", {"table_id": tid})
            return repo.get_snapshot(redis, tid)

        now = utc_ms()
        bet_deadline_ts = now + settings.bet_time_seconds * 1000 if settings.bet_time_seconds > 0 else 0
        repo.clear_bets(redis, tid)
        repo.clear_hands(redis, tid)
        repo.set_meta(
            redis,
            tid,
            {
                "phase": "WAITING_FOR_BETS",
                "bet_deadline_ts": bet_deadline_ts,
                "pending_advance_ts": 0,
                "pending_advance_seat": 0,
                "dealer_revealed": 0,
                "pending_double_due_ts": 0,
                "pending_double_seat": 0,
                "pending_double_player_id": "",
                "pending_double_hand_id": "",
                "pending_bust_announce_ts": 0,
                "pending_bust_seat": 0,
                "pending_bust_player_id": "",
            },
        )
        _emit(emit, "PHASE_CHANGED", {"phase": "WAITING_FOR_BETS"})
        return repo.get_snapshot(redis, tid)

    # True blackjack deal order:
    # 1) One card to each active player (in seat order)
    # 2) Dealer upcard
    # 3) Second card to each active player (in seat order)
    # 4) Dealer hole card
    hands: Dict[str, Dict[str, Any]] = {}
    deal_started_ts = utc_ms() + DEAL_SHUFFLE_MS
    repo.set_meta(redis, tid, {"deal_started_ts": deal_started_ts})
    _emit(emit, "DEAL_STARTED", {"deal_started_ts": deal_started_ts})
    seat_order = [seat for seat, _ in betting_seats]
    seat_rank = {seat: idx for idx, seat in enumerate(seat_order)}
    for seat, pid in betting_seats:
        hand_id = new_id()
        seat = seat or repo.get_seat_for_player(redis, tid, pid)
        card1 = _draw_card(redis, tid)
        hands[pid] = {"hand_id": hand_id, "seat": seat, "cards": [card1]}
        _set_hand(redis, tid, hand_id, [card1])
        repo.set_player_hand_ids(redis, tid, pid, [hand_id])
        seq = seat_rank.get(seat, 0)
        _emit(
            emit,
            "CARD_DEALT",
            {
                "to": "player",
                "seat": seat,
                "hand_id": hand_id,
                "card_index": 0,
                "card": card1,
                "face_down": False,
                "deal_started_ts": deal_started_ts,
                "deal_seq": seq,
                "deal_gap_ms": DEAL_GAP_MS,
            },
        )

    dealer_hand_id = new_id()
    dealer_up = _draw_card(redis, tid)
    _set_hand(redis, tid, dealer_hand_id, [dealer_up])
    repo.set_meta(
        redis,
        tid,
        {
            "dealer_hand_id": dealer_hand_id,
        },
    )
    _emit(
        emit,
        "CARD_DEALT",
        {
            "to": "dealer",
            "card": dealer_up,
            "face_down": False,
            "deal_started_ts": deal_started_ts,
            "deal_seq": len(betting_seats),
            "deal_gap_ms": DEAL_GAP_MS,
        },
    )

    for _, pid in betting_seats:
        hand = hands.get(pid)
        if not hand:
            continue
        hand_id = hand["hand_id"]
        seat = hand["seat"]
        cards = list(hand["cards"])
        card2 = _draw_card(redis, tid)
        cards.append(card2)
        hand["cards"] = cards
        _set_hand(redis, tid, hand_id, cards)
        seq = len(betting_seats) + 1 + seat_rank.get(seat, 0)
        _emit(
            emit,
            "CARD_DEALT",
            {
                "to": "player",
                "seat": seat,
                "hand_id": hand_id,
                "card_index": 1,
                "card": card2,
                "face_down": False,
                "deal_started_ts": deal_started_ts,
                "deal_seq": seq,
                "deal_gap_ms": DEAL_GAP_MS,
            },
        )

    dealer_hole = _draw_card(redis, tid)
    _set_hand(redis, tid, dealer_hand_id, [dealer_up, dealer_hole])
    _emit(
        emit,
        "CARD_DEALT",
        {
            "to": "dealer",
            "card": None,
            "face_down": True,
            "deal_started_ts": deal_started_ts,
            "deal_seq": len(betting_seats) * 2 + 1,
            "deal_gap_ms": DEAL_GAP_MS,
        },
    )
    max_seq = len(betting_seats) * 2 + 1
    turn_due_ts = deal_started_ts + max_seq * DEAL_GAP_MS + DEAL_ANIM_MS
    repo.set_meta(
        redis,
        tid,
        {
            "turn_start_due_ts": turn_due_ts,
            "turn_seat": 0,
            "deal_pending": 0,
            "dealer_revealed": 0,
            "pending_double_due_ts": 0,
            "pending_double_seat": 0,
            "pending_double_player_id": "",
            "pending_double_hand_id": "",
            "pending_bust_announce_ts": 0,
            "pending_bust_seat": 0,
            "pending_bust_player_id": "",
        },
    )
    return repo.get_snapshot(redis, tid)


def handle_action(
    redis: Redis,
    tid: str,
    pid: str,
    action: str,
    request_id: str,
    emit: Callable[[str, Dict], None] | None = None,
) -> Dict:
    with table_lock(redis, tid):
        meta = repo.get_meta(redis, tid)
        if meta.get("phase") != "PLAYER_TURNS":
            raise ValueError("Actions not allowed in current phase")
        if _is_paused(meta):
            raise ValueError("Table is paused")
        pending_ts = int(meta.get("pending_advance_ts", "0") or 0)
        pending_seat = int(meta.get("pending_advance_seat", "0") or 0)
        if pending_ts and utc_ms() < pending_ts:
            raise ValueError("Waiting for turn resolution")
        pending_bust_announce_ts = int(meta.get("pending_bust_announce_ts", "0") or 0)
        if pending_bust_announce_ts:
            if utc_ms() < pending_bust_announce_ts:
                raise ValueError("Waiting for bust reveal")
            raise ValueError("Waiting for bust announcement")
        pending_double_due_ts = int(meta.get("pending_double_due_ts", "0") or 0)
        if pending_double_due_ts:
            raise ValueError("Waiting for double-down resolution")

        if not repo.mark_request(redis, tid, request_id):
            return repo.get_snapshot(redis, tid)

        seat = repo.get_seat_for_player(redis, tid, pid)
        if seat is None:
            raise ValueError("Player not seated")
        if int(meta.get("turn_seat", "0") or 0) != seat:
            raise ValueError("Not your turn")
        if pending_seat and pending_ts > 0:
            raise ValueError("Waiting for turn advance")

        if pending_seat and pending_ts == 0:
            if seat != pending_seat:
                raise ValueError("Not your turn")
            if action != "next":
                raise ValueError("Waiting for bust acknowledgment")
            repo.set_meta(
                redis,
                tid,
                {
                    "pending_advance_ts": 0,
                    "pending_advance_seat": 0,
                    "pending_bust_announce_ts": 0,
                    "pending_bust_seat": 0,
                    "pending_bust_player_id": "",
                },
            )
            return _advance_turn(redis, tid, seat, emit)

        player = repo.get_player(redis, tid, pid)
        hand_ids_raw = player.get("hand_ids")
        if not hand_ids_raw:
            raise ValueError("No active hand")
        hand_ids = json.loads(hand_ids_raw)
        hand_id = hand_ids[0] if hand_ids else None
        if not hand_id:
            raise ValueError("No active hand")

        cards = repo.load_hand_cards(redis, tid, hand_id)
        seat = repo.get_seat_for_player(redis, tid, pid)
        _emit(emit, "PLAYER_ACTION", {"player_id": pid, "seat": seat, "action": action})
        if action == "hit":
            new_card = _draw_card(redis, tid)
            cards.append(new_card)
            _set_hand(redis, tid, hand_id, cards)
            _emit(
                emit,
                "CARD_DEALT",
                {
                    "to": "player",
                    "seat": seat,
                    "hand_id": hand_id,
                    "card_index": len(cards) - 1,
                    "card": new_card,
                    "face_down": False,
                    "deal_started_ts": utc_ms() + DEAL_GAP_MS,
                    "deal_seq": 0,
                    "deal_gap_ms": DEAL_GAP_MS,
                },
            )
            total, _ = hand_value(cards)
            if total > 21:
                bust_due_ts = utc_ms() + BUST_REVEAL_DELAY_MS
                repo.set_meta(
                    redis,
                    tid,
                    {
                        "pending_advance_ts": 0,
                        "pending_advance_seat": seat,
                        "pending_bust_announce_ts": bust_due_ts,
                        "pending_bust_seat": seat,
                        "pending_bust_player_id": pid,
                        "pending_double_due_ts": 0,
                        "pending_double_seat": 0,
                        "pending_double_player_id": "",
                        "pending_double_hand_id": "",
                    },
                )
                _emit(
                    emit,
                    "PLAYER_BUST",
                    {"player_id": pid, "seat": seat, "advance_at_ts": 0, "requires_ack": True},
                )
                return repo.get_snapshot(redis, tid)
            return repo.get_snapshot(redis, tid)
        if action == "stand":
            return _advance_turn(redis, tid, seat, emit)
        if action == "double":
            if len(cards) != 2:
                raise ValueError("Double down only allowed on first decision")
            bet = int(player.get("bet", "0") or 0)
            if bet <= 0:
                raise ValueError("Cannot double without an active bet")
            bankroll = int(player.get("bankroll", "0") or 0)
            if bankroll < bet:
                raise ValueError("Insufficient bankroll to double down")

            repo.adjust_bankroll(redis, tid, pid, -bet)
            doubled_bet = bet * 2
            repo.set_bet(redis, tid, pid, doubled_bet)
            _emit(
                emit,
                "BET_DOUBLED",
                {"player_id": pid, "seat": seat, "amount": doubled_bet, "added": bet},
            )
            _emit_announcement(
                redis,
                tid,
                emit,
                f"{_seat_display_name(redis, tid, seat)} DOUBLES DOWN",
                tone="neutral",
                duration_ms=DOUBLE_ANNOUNCE_MS,
            )
            repo.set_meta(
                redis,
                tid,
                {
                    "pending_double_due_ts": utc_ms() + DOUBLE_ANNOUNCE_MS,
                    "pending_double_seat": seat,
                    "pending_double_player_id": pid,
                    "pending_double_hand_id": hand_id,
                    "pending_advance_ts": 0,
                    "pending_advance_seat": 0,
                    "pending_bust_announce_ts": 0,
                    "pending_bust_seat": 0,
                    "pending_bust_player_id": "",
                },
            )
            return repo.get_snapshot(redis, tid)
        if action == "next":
            raise ValueError("No bust to acknowledge")
        raise ValueError("Unknown action")


def _advance_turn(
    redis: Redis,
    tid: str,
    current_seat: int,
    emit: Callable[[str, Dict], None] | None = None,
) -> Dict:
    players = repo.get_all_players(redis, tid)
    betting_seats = _betting_players(players)
    if not betting_seats:
        return _dealer_turn_and_settle(redis, tid, emit)

    seats = sorted({seat for seat, _ in betting_seats})
    next_seat = next((seat for seat in seats if seat > current_seat), None)
    if not next_seat:
        return _dealer_turn_and_settle(redis, tid, emit)

    repo.set_meta(
        redis,
        tid,
        {
            "turn_seat": next_seat,
            "pending_advance_ts": 0,
            "pending_advance_seat": 0,
            "pending_bust_announce_ts": 0,
            "pending_bust_seat": 0,
            "pending_bust_player_id": "",
            "pending_double_due_ts": 0,
            "pending_double_seat": 0,
            "pending_double_player_id": "",
            "pending_double_hand_id": "",
        },
    )
    _emit(emit, "TURN_STARTED", {"seat": next_seat})
    _emit_announcement(redis, tid, emit, f"{_seat_display_name(redis, tid, next_seat)}'S TURN")
    return repo.get_snapshot(redis, tid)


def advance_pending_turn(
    redis: Redis, tid: str, emit: Callable[[str, Dict], None] | None = None
) -> Dict:
    with table_lock(redis, tid):
        meta = repo.get_meta(redis, tid)
        if _is_paused(meta):
            return repo.get_snapshot(redis, tid)
        if meta.get("phase") != "PLAYER_TURNS":
            return repo.get_snapshot(redis, tid)
        pending_ts = int(meta.get("pending_advance_ts", "0") or 0)
        pending_seat = int(meta.get("pending_advance_seat", "0") or 0)
        if not pending_ts or not pending_seat:
            return repo.get_snapshot(redis, tid)
        now = utc_ms()
        if now < pending_ts:
            return repo.get_snapshot(redis, tid)
        repo.set_meta(redis, tid, {"pending_advance_ts": 0, "pending_advance_seat": 0})
        return _advance_turn(redis, tid, pending_seat, emit)


def advance_bust_pending(
    redis: Redis, tid: str, emit: Callable[[str, Dict], None] | None = None
) -> Dict:
    with table_lock(redis, tid):
        meta = repo.get_meta(redis, tid)
        if _is_paused(meta):
            return repo.get_snapshot(redis, tid)
        if meta.get("phase") != "PLAYER_TURNS":
            return repo.get_snapshot(redis, tid)

        due_ts = int(meta.get("pending_bust_announce_ts", "0") or 0)
        seat = int(meta.get("pending_bust_seat", "0") or 0)
        pid = str(meta.get("pending_bust_player_id") or "").strip()
        if not due_ts or not seat or not pid:
            return repo.get_snapshot(redis, tid)
        if utc_ms() < due_ts:
            return repo.get_snapshot(redis, tid)
        if int(meta.get("turn_seat", "0") or 0) != seat:
            repo.set_meta(
                redis,
                tid,
                {
                    "pending_bust_announce_ts": 0,
                    "pending_bust_seat": 0,
                    "pending_bust_player_id": "",
                },
            )
            return repo.get_snapshot(redis, tid)

        _emit_announcement(
            redis,
            tid,
            emit,
            f"{_seat_display_name(redis, tid, seat)} BUSTS",
            tone="loss",
            duration_ms=BUST_ANNOUNCE_MS,
            target_seat=seat,
        )
        repo.set_meta(
            redis,
            tid,
            {
                "pending_bust_announce_ts": 0,
                "pending_bust_seat": 0,
                "pending_bust_player_id": "",
            },
        )
        return repo.get_snapshot(redis, tid)


def advance_double_pending(
    redis: Redis, tid: str, emit: Callable[[str, Dict], None] | None = None
) -> Dict:
    with table_lock(redis, tid):
        meta = repo.get_meta(redis, tid)
        if _is_paused(meta):
            return repo.get_snapshot(redis, tid)
        if meta.get("phase") != "PLAYER_TURNS":
            return repo.get_snapshot(redis, tid)

        due_ts = int(meta.get("pending_double_due_ts", "0") or 0)
        seat = int(meta.get("pending_double_seat", "0") or 0)
        pid = str(meta.get("pending_double_player_id") or "").strip()
        hand_id = str(meta.get("pending_double_hand_id") or "").strip()
        if not due_ts or not seat or not pid or not hand_id:
            return repo.get_snapshot(redis, tid)
        if utc_ms() < due_ts:
            return repo.get_snapshot(redis, tid)
        if int(meta.get("turn_seat", "0") or 0) != seat:
            repo.set_meta(
                redis,
                tid,
                {
                    "pending_double_due_ts": 0,
                    "pending_double_seat": 0,
                    "pending_double_player_id": "",
                    "pending_double_hand_id": "",
                    "pending_bust_announce_ts": 0,
                    "pending_bust_seat": 0,
                    "pending_bust_player_id": "",
                },
            )
            return repo.get_snapshot(redis, tid)

        cards = repo.load_hand_cards(redis, tid, hand_id)
        if not cards:
            repo.set_meta(
                redis,
                tid,
                {
                    "pending_double_due_ts": 0,
                    "pending_double_seat": 0,
                    "pending_double_player_id": "",
                    "pending_double_hand_id": "",
                    "pending_bust_announce_ts": 0,
                    "pending_bust_seat": 0,
                    "pending_bust_player_id": "",
                },
            )
            return _advance_turn(redis, tid, seat, emit)

        new_card = _draw_card(redis, tid)
        cards.append(new_card)
        _set_hand(redis, tid, hand_id, cards)
        _emit(
            emit,
            "CARD_DEALT",
            {
                "to": "player",
                "seat": seat,
                "hand_id": hand_id,
                "card_index": len(cards) - 1,
                "card": new_card,
                "face_down": False,
                "deal_started_ts": utc_ms() + DEAL_GAP_MS,
                "deal_seq": 0,
                "deal_gap_ms": DEAL_GAP_MS,
            },
        )
        repo.set_meta(
            redis,
            tid,
            {
                "pending_double_due_ts": 0,
                "pending_double_seat": 0,
                "pending_double_player_id": "",
                "pending_double_hand_id": "",
                "pending_bust_announce_ts": 0,
                "pending_bust_seat": 0,
                "pending_bust_player_id": "",
            },
        )

        total, _ = hand_value(cards)
        if total > 21:
            bust_due_ts = utc_ms() + BUST_REVEAL_DELAY_MS
            repo.set_meta(
                redis,
                tid,
                {
                    "pending_advance_ts": 0,
                    "pending_advance_seat": seat,
                    "pending_bust_announce_ts": bust_due_ts,
                    "pending_bust_seat": seat,
                    "pending_bust_player_id": pid,
                },
            )
            _emit(
                emit,
                "PLAYER_BUST",
                {"player_id": pid, "seat": seat, "advance_at_ts": 0, "requires_ack": True},
            )
            return repo.get_snapshot(redis, tid)
        repo.set_meta(
            redis,
            tid,
            {
                "pending_advance_ts": utc_ms() + DEAL_GAP_MS + DEAL_ANIM_MS,
                "pending_advance_seat": seat,
                "pending_bust_announce_ts": 0,
                "pending_bust_seat": 0,
                "pending_bust_player_id": "",
            },
        )
        return repo.get_snapshot(redis, tid)


def advance_inactive_turn(
    redis: Redis, tid: str, emit: Callable[[str, Dict], None] | None = None
) -> Dict:
    with table_lock(redis, tid):
        meta = repo.get_meta(redis, tid)
        if _is_paused(meta):
            return repo.get_snapshot(redis, tid)
        if meta.get("phase") != "PLAYER_TURNS":
            return repo.get_snapshot(redis, tid)
        if int(meta.get("pending_advance_ts", "0") or 0):
            return repo.get_snapshot(redis, tid)
        if int(meta.get("pending_bust_announce_ts", "0") or 0):
            return repo.get_snapshot(redis, tid)
        if int(meta.get("pending_double_due_ts", "0") or 0):
            return repo.get_snapshot(redis, tid)
        turn_seat = int(meta.get("turn_seat", "0") or 0)
        if not turn_seat:
            return repo.get_snapshot(redis, tid)

        players = repo.get_all_players(redis, tid)
        status = None
        for pdata in players.values():
            seat = int(pdata.get("seat", "0") or 0)
            if seat == turn_seat:
                status = pdata.get("status") or "active"
                break
        if status == "active":
            return repo.get_snapshot(redis, tid)

        return _advance_turn(redis, tid, turn_seat, emit)


def _dealer_turn_and_settle(
    redis: Redis, tid: str, emit: Callable[[str, Dict], None] | None = None
) -> Dict:
    meta = repo.get_meta(redis, tid)
    repo.set_meta(
        redis,
        tid,
        {
            "phase": "DEALER_TURN",
            "turn_seat": 0,
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
            "dealer_step": "REVEAL",
            "dealer_step_due_ts": utc_ms() + DEALER_REVEAL_MS,
            "dealer_seq": 0,
        },
    )
    _emit(emit, "PHASE_CHANGED", {"phase": "DEALER_TURN"})
    dealer_rule = meta.get("dealer_soft_17_rule")
    if not dealer_rule:
        dealer_rule = random.choice(["S17", "H17"])
        repo.set_meta(redis, tid, {"dealer_soft_17_rule": dealer_rule})
    return repo.get_snapshot(redis, tid)


def advance_dealer(
    redis: Redis, tid: str, emit: Callable[[str, Dict], None] | None = None
) -> Dict:
    with table_lock(redis, tid):
        meta = repo.get_meta(redis, tid)
        if _is_paused(meta):
            return repo.get_snapshot(redis, tid)
        if meta.get("phase") != "DEALER_TURN":
            return repo.get_snapshot(redis, tid)
        step = meta.get("dealer_step") or ""
        due_ts = int(meta.get("dealer_step_due_ts", "0") or 0)
        seq = int(meta.get("dealer_seq", "0") or 0)
        now = utc_ms()
        if step not in {"REVEAL", "REVEAL_WAIT", "DRAW"} or not due_ts:
            repo.set_meta(
                redis,
                tid,
                {
                    "dealer_step": "REVEAL",
                    "dealer_step_due_ts": now + DEALER_REVEAL_MS,
                    "dealer_seq": 0,
                },
            )
            return repo.get_snapshot(redis, tid)
        if not due_ts or now < due_ts:
            return repo.get_snapshot(redis, tid)

        dealer_rule = meta.get("dealer_soft_17_rule") or random.choice(["S17", "H17"])
        dealer_hand_id = meta.get("dealer_hand_id")
        if not dealer_hand_id:
            dealer_hand_id = new_id()
            repo.set_meta(redis, tid, {"dealer_hand_id": dealer_hand_id})
        dealer_cards = repo.load_hand_cards(redis, tid, dealer_hand_id) or []

        timeline = {"deal_started_ts": now + DEALER_ANIM_DELAY_MS, "deal_seq": 0, "deal_gap_ms": DEALER_GAP_MS}

        if step == "REVEAL":
            _emit_announcement(redis, tid, emit, "DEALER REVEALS", tone="dealer")
            repo.set_meta(
                redis,
                tid,
                {
                    "dealer_step": "REVEAL_WAIT",
                    "dealer_step_due_ts": now,
                    "dealer_seq": seq,
                },
            )
            return repo.get_snapshot(redis, tid)

        if step == "REVEAL_WAIT":
            if dealer_cards:
                _emit(emit, "DEALER_REVEAL_HOLE", {"cards": dealer_cards, **timeline})
            repo.set_meta(
                redis,
                tid,
                {
                    "dealer_revealed": 1,
                    "dealer_step": "DRAW",
                    "dealer_step_due_ts": now + DEALER_STEP_MS,
                    "dealer_seq": seq + 1,
                },
            )
            return repo.get_snapshot(redis, tid)

        total, is_soft = hand_value(dealer_cards)
        if total > 21:
            _emit(emit, "DEALER_ACTION", {"action": "bust", "total": total, **timeline})
            return _settle_after_dealer(redis, tid, dealer_cards, emit)

        should_draw = total < 17 or (total == 17 and is_soft and dealer_rule == "H17")
        if should_draw:
            new_card = _draw_card(redis, tid)
            dealer_cards.append(new_card)
            _set_hand(redis, tid, dealer_hand_id, dealer_cards)
            _emit(
                emit,
                "DEALER_ACTION",
                {"action": "draw", "card": new_card, "total": hand_value(dealer_cards)[0], **timeline},
            )
            repo.set_meta(
                redis,
                tid,
                {
                    "dealer_step": "DRAW",
                    "dealer_step_due_ts": now + DEALER_STEP_MS,
                    "dealer_seq": seq + 1,
                },
            )
            return repo.get_snapshot(redis, tid)

        _emit(emit, "DEALER_ACTION", {"action": "stand", "total": total, **timeline})
        return _settle_after_dealer(redis, tid, dealer_cards, emit)


def _settle_after_dealer(
    redis: Redis, tid: str, dealer_cards: list[str], emit: Callable[[str, Dict], None] | None = None
) -> Dict:
    dealer_hand_id = repo.get_meta(redis, tid).get("dealer_hand_id")
    if dealer_hand_id:
        _set_hand(redis, tid, dealer_hand_id, dealer_cards)

    repo.set_meta(
        redis,
        tid,
        {
            "phase": "SETTLE",
            "pending_advance_ts": 0,
            "pending_advance_seat": 0,
            "dealer_step": "",
            "dealer_step_due_ts": 0,
            "dealer_seq": 0,
            "dealer_revealed": 1,
            "pending_bust_announce_ts": 0,
            "pending_bust_seat": 0,
            "pending_bust_player_id": "",
            "pending_double_due_ts": 0,
            "pending_double_seat": 0,
            "pending_double_player_id": "",
            "pending_double_hand_id": "",
            "settle_pending": 1,
            "settle_collect_started": 0,
        },
    )
    _emit(emit, "PHASE_CHANGED", {"phase": "SETTLE"})
    dealer_total, _ = hand_value(dealer_cards)
    dealer_blackjack = dealer_total == 21 and len(dealer_cards) == 2

    players = repo.get_all_players(redis, tid)
    for pid, pdata in players.items():
        bet = int(pdata.get("bet", "0") or 0)
        if bet <= 0:
            continue
        hand_ids_raw = pdata.get("hand_ids")
        if not hand_ids_raw:
            continue
        hand_ids = json.loads(hand_ids_raw)
        if not hand_ids:
            continue
        hand_id = hand_ids[0]
        player_cards = repo.load_hand_cards(redis, tid, hand_id)
        player_total, _ = hand_value(player_cards)
        player_blackjack = player_total == 21 and len(player_cards) == 2

        payout = 0
        reason = "LOSE"
        if player_blackjack and not dealer_blackjack:
            payout = bet + int(round(bet * settings.blackjack_payout))
            reason = "BLACKJACK"
        elif dealer_blackjack and not player_blackjack:
            payout = 0
            reason = "DEALER_BLACKJACK"
        elif player_total > 21:
            payout = 0
            reason = "BUST"
        elif dealer_total > 21:
            payout = bet * 2
            reason = "DEALER_BUST"
        elif player_total > dealer_total:
            payout = bet * 2
            reason = "WIN"
        elif player_total < dealer_total:
            payout = 0
            reason = "LOSE"
        else:
            payout = bet
            reason = "PUSH"

        if payout:
            repo.adjust_bankroll(redis, tid, pid, payout)
        seat = repo.get_seat_for_player(redis, tid, pid)
        _emit(emit, "PAYOUT", {"player_id": pid, "seat": seat, "delta": payout, "reason": reason})
        display_name = _seat_display_name(redis, tid, int(seat or 0))
        if reason in {"WIN", "BLACKJACK", "DEALER_BUST"}:
            _emit_announcement(redis, tid, emit, f"{display_name} WINS", tone="win")
        elif reason == "PUSH":
            _emit_announcement(redis, tid, emit, f"{display_name} PUSHES", tone="neutral")
        elif reason == "BUST":
            _emit_announcement(redis, tid, emit, f"{display_name} BUSTS", tone="loss")
        else:
            _emit_announcement(redis, tid, emit, f"{display_name} LOSES", tone="loss")
    return repo.get_snapshot(redis, tid)


def advance_settle(
    redis: Redis, tid: str, emit: Callable[[str, Dict], None] | None = None
) -> Dict:
    with table_lock(redis, tid):
        meta = repo.get_meta(redis, tid)
        if meta.get("phase") != "SETTLE":
            return repo.get_snapshot(redis, tid)
        if not int(meta.get("settle_pending", "0") or 0):
            return repo.get_snapshot(redis, tid)
        if _is_paused(meta):
            return repo.get_snapshot(redis, tid)
        if int(meta.get("settle_collect_started", "0") or 0) == 0:
            _emit(emit, "CHIPS_COLLECT", {"duration_ms": CHIPS_COLLECT_MS})
            _pause_for(redis, tid, CHIPS_COLLECT_MS)
            repo.set_meta(redis, tid, {"settle_collect_started": 1})
            return repo.get_snapshot(redis, tid)

        dealer_hand_id = meta.get("dealer_hand_id")
        dealer_cards = repo.load_hand_cards(redis, tid, dealer_hand_id) if dealer_hand_id else []
        players = repo.get_all_players(redis, tid)
        reveals: List[Dict] = []
        for pid, pdata in players.items():
            hand_ids_raw = pdata.get("hand_ids")
            if not hand_ids_raw:
                continue
            try:
                hand_ids = json.loads(hand_ids_raw)
            except Exception:
                hand_ids = []
            if not hand_ids:
                continue
            hand_id = hand_ids[0]
            player_cards = repo.load_hand_cards(redis, tid, hand_id)
            seat = repo.get_seat_for_player(redis, tid, pid)
            reveals.append({"seat": seat, "cards": player_cards})

        _emit(emit, "HANDS_REVEALED", {"dealer": dealer_cards, "players": reveals})

        repo.clear_hands(redis, tid)
        repo.clear_bets(redis, tid)

        now = utc_ms()
        repo.set_meta(
            redis,
            tid,
            {
                "phase": "VOTE_CONTINUE",
                "turn_seat": 0,
                "vote_deadline_ts": now + settings.vote_time_seconds * 1000,
                "settle_pending": 0,
                "settle_collect_started": 0,
            },
        )
        _emit(emit, "PHASE_CHANGED", {"phase": "VOTE_CONTINUE"})
        _emit(emit, "VOTE_STARTED", {"deadline_ts": now + settings.vote_time_seconds * 1000})
        return repo.get_snapshot(redis, tid)


def handle_vote_continue(
    redis: Redis,
    tid: str,
    pid: str,
    vote: str,
    request_id: str,
    emit: Callable[[str, Dict], None] | None = None,
) -> Dict:
    with table_lock(redis, tid):
        meta = repo.get_meta(redis, tid)
        if meta.get("phase") != "VOTE_CONTINUE":
            raise ValueError("Vote not allowed in current phase")

        if not repo.mark_request(redis, tid, request_id):
            return repo.get_snapshot(redis, tid)

        round_id = int(meta.get("round_id", "0") or 0)
        repo.cast_vote(redis, tid, round_id, pid, vote)
        repo.update_last_seen(redis, tid, pid)
        seat = repo.get_seat_for_player(redis, tid, pid)
        _emit(emit, "VOTE_CAST", {"player_id": pid, "seat": seat, "vote": vote})
        return finalize_vote(redis, tid, force_timeout=False, emit=emit, lock_enabled=False)


def finalize_vote(
    redis: Redis,
    tid: str,
    force_timeout: bool,
    emit: Callable[[str, Dict], None] | None = None,
    lock_enabled: bool = True,
) -> Dict:
    if lock_enabled:
        with table_lock(redis, tid):
            return finalize_vote(redis, tid, force_timeout, emit=emit, lock_enabled=False)

    meta = repo.get_meta(redis, tid)
    if _is_paused(meta):
        return repo.get_snapshot(redis, tid)
    if meta.get("phase") != "VOTE_CONTINUE":
        return repo.get_snapshot(redis, tid)

    round_id = int(meta.get("round_id", "0") or 0)
    players = repo.get_all_players(redis, tid)
    votes = repo.get_votes(redis, tid, round_id)
    deadline = int(meta.get("vote_deadline_ts", "0") or 0)
    now = utc_ms()

    if not force_timeout and deadline and now <= deadline and len(votes) < len(players):
        return repo.get_snapshot(redis, tid)

    yes = 0
    no = 0
    no_vote_as = (settings.no_vote_counts_as or "NO").upper()
    for pid in players:
        v = votes.get(pid)
        if not v:
            if no_vote_as == "YES":
                yes += 1
            else:
                no += 1
        elif v.lower() == "yes":
            yes += 1
        else:
            no += 1

    if no > yes:
        repo.set_meta(redis, tid, {"phase": "SESSION_ENDED"})
        repo.clear_votes(redis, tid, round_id)
        _emit(emit, "VOTE_RESULT", {"result": "END", "yes": yes, "no": no})
        _emit(emit, "SESSION_ENDED", {"table_id": tid})
        return repo.get_snapshot(redis, tid)

    if yes == no:
        outcome = (
            "END"
            if (settings.tie_result or "CONTINUE").upper() == "END"
            else "CONTINUE"
        )
    else:
        outcome = "CONTINUE"

    if outcome == "END":
        repo.set_meta(redis, tid, {"phase": "SESSION_ENDED"})
        repo.clear_votes(redis, tid, round_id)
        _emit(emit, "VOTE_RESULT", {"result": "END", "yes": yes, "no": no})
        _emit(emit, "SESSION_ENDED", {"table_id": tid})
        return repo.get_snapshot(redis, tid)

    repo.clear_votes(redis, tid, round_id)
    apply_pending_config(redis, tid)
    bet_deadline_ts = now + settings.bet_time_seconds * 1000 if settings.bet_time_seconds > 0 else 0
    repo.set_meta(
        redis,
        tid,
        {
            "phase": "WAITING_FOR_BETS",
            "round_id": round_id + 1,
            "bet_deadline_ts": bet_deadline_ts,
            "vote_deadline_ts": 0,
            "pending_advance_ts": 0,
            "pending_advance_seat": 0,
            "dealer_revealed": 0,
            "pending_double_due_ts": 0,
            "pending_double_seat": 0,
            "pending_double_player_id": "",
            "pending_double_hand_id": "",
            "pending_bust_announce_ts": 0,
            "pending_bust_seat": 0,
            "pending_bust_player_id": "",
        },
    )
    repo.clear_bets(redis, tid)
    repo.clear_hands(redis, tid)
    _emit(emit, "VOTE_RESULT", {"result": "CONTINUE", "yes": yes, "no": no})
    _emit(emit, "PHASE_CHANGED", {"phase": "WAITING_FOR_BETS"})
    return repo.get_snapshot(redis, tid)
