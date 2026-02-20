import asyncio
import json
from collections import defaultdict
from typing import Any, Callable, Dict, List, Tuple

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.domain.models.messages import (
    ErrorMessage,
    Hello,
    JoinTable,
    PlaceBet,
    ActionMessage,
    ReadyToggle,
    StartSession,
    Welcome,
    VoteContinue,
    Sync,
    AdminConfig,
    parse_client_message,
)
from app.infra.redis.client import get_redis
from app.infra.redis import repo, stream
from app.services.table_service import (
    handle_hello,
    handle_join_table,
    handle_ready_toggle,
    handle_start_session,
    handle_admin_config,
)
from app.services.round_service import handle_place_bet, handle_action, handle_vote_continue
router = APIRouter()


class ConnectionManager:
    def __init__(self) -> None:
        self._active: set[WebSocket] = set()
        self._by_table: dict[str, set[WebSocket]] = defaultdict(set)
        self._ws_table: dict[WebSocket, str] = {}
        self._ws_pid: dict[WebSocket, str] = {}

    async def connect(self, ws: WebSocket) -> None:
        self._active.add(ws)

    def identify(self, ws: WebSocket, player_id: str) -> None:
        self._ws_pid[ws] = player_id

    def player_id(self, ws: WebSocket) -> str | None:
        return self._ws_pid.get(ws)

    def bind(self, ws: WebSocket, table_id: str) -> None:
        prev = self._ws_table.get(ws)
        if prev:
            self._by_table[prev].discard(ws)
        self._ws_table[ws] = table_id
        self._by_table[table_id].add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._active.discard(ws)
        self._ws_pid.pop(ws, None)
        table_id = self._ws_table.pop(ws, None)
        if table_id:
            self._by_table[table_id].discard(ws)
            if not self._by_table[table_id]:
                self._by_table.pop(table_id, None)

    def targets(self, table_id: str) -> list[WebSocket]:
        targets = self._by_table.get(table_id)
        if not targets:
            return []
        return list(targets)

    async def broadcast(self, table_id: str, message: Dict[str, Any]) -> None:
        targets = self._by_table.get(table_id)
        if not targets:
            return
        dead: List[WebSocket] = []
        coros = []
        for ws in targets:
            coros.append(self._safe_send(ws, message, dead))
        if coros:
            await asyncio.gather(*coros)
        for ws in dead:
            self.disconnect(ws)

    async def broadcast_personalized(
        self, table_id: str, build_message: Callable[[WebSocket], Dict[str, Any] | None]
    ) -> None:
        targets = self._by_table.get(table_id)
        if not targets:
            return
        dead: List[WebSocket] = []
        coros = []
        for ws in targets:
            msg = build_message(ws)
            if msg is None:
                continue
            coros.append(self._safe_send(ws, msg, dead))
        if coros:
            await asyncio.gather(*coros)
        for ws in dead:
            self.disconnect(ws)

    async def _safe_send(
        self, ws: WebSocket, message: Dict[str, Any], dead: List[WebSocket]
    ) -> None:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)


manager = ConnectionManager()


async def _safe_send_json(ws: WebSocket, payload: Dict[str, Any]) -> bool:
    try:
        await ws.send_json(payload)
        return True
    except (WebSocketDisconnect, RuntimeError):
        return False
    except Exception:
        return False


def _json_list(raw: Any) -> list[Any]:
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    if not isinstance(raw, str):
        return []
    try:
        value = json.loads(raw)
    except Exception:
        return []
    return value if isinstance(value, list) else []


def _personalize_snapshot(
    redis, table_id: str, player_id: str | None, snapshot: Dict[str, Any]
) -> Dict[str, Any]:
    players = snapshot.get("players") or {}
    phase = str((snapshot.get("meta") or {}).get("phase") or "")
    reveal_all = phase in {"SETTLE", "VOTE_CONTINUE", "SESSION_ENDED"}
    reveal_own = phase in {"PLAYER_TURNS", "DEALER_TURN"}
    ready_players = repo.get_ready_players(redis, table_id)

    next_players: Dict[str, Dict[str, Any]] = {}
    for pid, pdata in players.items():
        player_data = dict(pdata or {})
        player_data["ready"] = "1" if pid in ready_players else "0"

        if phase == "DEAL_INITIAL":
            player_data["hand_count"] = "0"
            player_data["hand_cards"] = "[]"
            next_players[pid] = player_data
            continue

        hand_ids = _json_list(player_data.get("hand_ids"))
        cards: list[str] = []
        if hand_ids:
            hand_id = hand_ids[0]
            if isinstance(hand_id, str) and hand_id:
                cards = repo.load_hand_cards(redis, table_id, hand_id)
        player_data["hand_count"] = str(len(cards))
        if reveal_all or (reveal_own and pid == player_id):
            player_data["hand_cards"] = json.dumps(cards)
        else:
            player_data["hand_cards"] = json.dumps([None] * len(cards))
        next_players[pid] = player_data

    return {
        **snapshot,
        "players": next_players,
    }

def _redact_event_payload(event_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if event_type == "CARD_DEALT" and payload.get("to") == "player":
        redacted = dict(payload)
        redacted["card"] = None
        redacted["face_down"] = True
        return redacted
    return payload


def _lookup_hand_card(
    redis, table_id: str, hand_id: str | None, card_index: int
) -> str | None:
    if not hand_id:
        return None
    if card_index < 0:
        return None
    cards = repo.load_hand_cards(redis, table_id, hand_id)
    if 0 <= card_index < len(cards):
        return cards[card_index]
    return None


def _personalize_event_payload(
    redis,
    table_id: str,
    event_type: str,
    payload: Dict[str, Any],
    ws_seat: int | None,
    original_payload: Dict[str, Any] | None = None,
) -> Dict[str, Any] | None:
    if event_type == "ANNOUNCEMENT":
        raw_target = payload.get("target_seat")
        try:
            target_seat = int(raw_target) if raw_target is not None else 0
        except Exception:
            target_seat = 0
        if target_seat > 0:
            if not ws_seat or ws_seat != target_seat:
                return None
            personalized = dict(payload)
            personalized.pop("target_seat", None)
            return personalized
        return payload

    if event_type != "CARD_DEALT":
        return payload
    if payload.get("to") != "player":
        return payload

    try:
        target_seat = int(payload.get("seat") or 0)
    except Exception:
        target_seat = 0
    if not ws_seat or ws_seat != target_seat:
        return payload

    card = None
    if original_payload is not None:
        c = original_payload.get("card")
        if isinstance(c, str):
            card = c

    if card is None:
        hand_id = payload.get("hand_id")
        try:
            raw_idx = payload.get("card_index")
            idx = int(raw_idx) if raw_idx is not None else -1
        except Exception:
            idx = -1
        card = _lookup_hand_card(redis, table_id, hand_id, idx)

    if card is None:
        # If we can't resolve the card yet (legacy events, race, cleared hand),
        # keep it face-down to avoid rendering a blank face-up card in the UI.
        return payload

    personalized = dict(payload)
    personalized["card"] = card
    personalized["face_down"] = False
    return personalized


async def append_and_broadcast(
    redis,
    table_id: str,
    event_type: str,
    session_id: str,
    round_id: int,
    payload: Dict[str, Any],
) -> str:
    payload_redacted = _redact_event_payload(event_type, payload)
    event_id = stream.append_event(
        redis, table_id, event_type, session_id, round_id, payload_redacted
    )

    targets = manager.targets(table_id)
    seat_by_ws: Dict[WebSocket, int | None] = {}
    for ws in targets:
        pid = manager.player_id(ws)
        seat_by_ws[ws] = repo.get_seat_for_player(redis, table_id, pid) if pid else None

    def _build_message(ws: WebSocket) -> Dict[str, Any] | None:
        personalized_payload = _personalize_event_payload(
            redis,
            table_id,
            event_type,
            payload_redacted,
            seat_by_ws.get(ws),
            original_payload=payload,
        )
        if personalized_payload is None:
            return None
        return {
            "event_id": event_id,
            "type": event_type,
            "session_id": session_id,
            "round_id": round_id,
            "payload": personalized_payload,
        }

    await manager.broadcast_personalized(table_id, _build_message)
    return event_id


@router.websocket("/ws/blackjack")
async def blackjack_ws(ws: WebSocket) -> None:
    await ws.accept()
    await manager.connect(ws)
    redis = get_redis()
    player_id: str | None = None
    reconnect_token: str | None = None
    nickname: str | None = None
    table_id: str | None = None
    try:
        while True:
            events: List[Tuple[str, Dict[str, Any]]] = []

            def emit(event_type: str, payload: Dict[str, Any]) -> None:
                events.append((event_type, payload))

            try:
                payload = await ws.receive_json()
            except WebSocketDisconnect:
                break
            except Exception as exc:
                err = ErrorMessage(
                    code="BAD_JSON",
                    message="Invalid JSON payload",
                    details={"error": str(exc)},
                )
                if not await _safe_send_json(ws, err.model_dump()):
                    break
                continue

            try:
                msg = parse_client_message(payload)
            except (ValueError, ValidationError) as exc:
                err = ErrorMessage(
                    code="BAD_REQUEST",
                    message="Invalid message schema",
                    details={"error": str(exc)},
                )
                if not await _safe_send_json(ws, err.model_dump()):
                    break
                continue

            if isinstance(msg, Hello):
                nickname = msg.nickname
                result = handle_hello(redis, nickname, msg.reconnect_token)
                player_id = result["player_id"]
                reconnect_token = result["reconnect_token"]
                manager.identify(ws, player_id)
                welcome = Welcome(player_id=player_id, reconnect_token=reconnect_token)
                if not await _safe_send_json(ws, welcome.model_dump()):
                    break
                continue

            if player_id is None or reconnect_token is None or nickname is None:
                err = ErrorMessage(
                    code="HELLO_REQUIRED",
                    message="Send HELLO before other messages",
                )
                if not await _safe_send_json(ws, err.model_dump()):
                    break
                continue

            if isinstance(msg, JoinTable):
                table_id = msg.table_id
                try:
                    snapshot = handle_join_table(
                        redis, table_id, player_id, nickname, reconnect_token, emit=emit
                    )
                except ValueError as exc:
                    err = ErrorMessage(code="JOIN_DENIED", message=str(exc))
                    if not await _safe_send_json(ws, err.model_dump()):
                        break
                    continue
                manager.bind(ws, table_id)
                if not await _send_snapshot(ws, redis, table_id, player_id, snapshot):
                    break
                repo.update_last_seen(redis, table_id, player_id)
                await _flush_events(redis, table_id, events)
                _cleanup_if_session_ended(redis, table_id, snapshot)
                continue

            if table_id is None:
                err = ErrorMessage(
                    code="JOIN_REQUIRED",
                    message="Send JOIN_TABLE before lobby actions",
                )
                if not await _safe_send_json(ws, err.model_dump()):
                    break
                continue

            if isinstance(msg, ReadyToggle):
                try:
                    snapshot = handle_ready_toggle(redis, table_id, player_id, emit=emit)
                except ValueError as exc:
                    err = ErrorMessage(code="READY_DENIED", message=str(exc))
                    if not await _safe_send_json(ws, err.model_dump()):
                        break
                    continue
                if not await _send_snapshot(ws, redis, table_id, player_id, snapshot):
                    break
                repo.update_last_seen(redis, table_id, player_id)
                await _flush_events(redis, table_id, events)
                _cleanup_if_session_ended(redis, table_id, snapshot)
                continue

            if isinstance(msg, StartSession):
                try:
                    snapshot = handle_start_session(redis, table_id, emit=emit)
                except ValueError as exc:
                    err = ErrorMessage(code="START_DENIED", message=str(exc))
                    if not await _safe_send_json(ws, err.model_dump()):
                        break
                    continue
                if not await _send_snapshot(ws, redis, table_id, player_id, snapshot):
                    break
                repo.update_last_seen(redis, table_id, player_id)
                await _flush_events(redis, table_id, events)
                _cleanup_if_session_ended(redis, table_id, snapshot)
                continue

            if isinstance(msg, AdminConfig):
                try:
                    snapshot = handle_admin_config(
                        redis,
                        table_id,
                        msg.model_dump(exclude={"type"}),
                        emit=emit,
                    )
                except ValueError as exc:
                    err = ErrorMessage(code="ADMIN_DENIED", message=str(exc))
                    if not await _safe_send_json(ws, err.model_dump()):
                        break
                    continue
                if not await _send_snapshot(ws, redis, table_id, player_id, snapshot):
                    break
                repo.update_last_seen(redis, table_id, player_id)
                await _flush_events(redis, table_id, events)
                _cleanup_if_session_ended(redis, table_id, snapshot)
                continue

            if isinstance(msg, PlaceBet):
                try:
                    snapshot = handle_place_bet(
                        redis, table_id, player_id, msg.amount, msg.request_id, emit=emit
                    )
                except ValueError as exc:
                    err = ErrorMessage(code="BET_DENIED", message=str(exc))
                    if not await _safe_send_json(ws, err.model_dump()):
                        break
                    continue
                if not await _send_snapshot(ws, redis, table_id, player_id, snapshot):
                    break
                repo.update_last_seen(redis, table_id, player_id)
                await _flush_events(redis, table_id, events)
                _cleanup_if_session_ended(redis, table_id, snapshot)
                continue

            if isinstance(msg, ActionMessage):
                try:
                    snapshot = handle_action(
                        redis,
                        table_id,
                        player_id,
                        msg.action.value,
                        msg.request_id,
                        emit=emit,
                    )
                except ValueError as exc:
                    err = ErrorMessage(code="ACTION_DENIED", message=str(exc))
                    if not await _safe_send_json(ws, err.model_dump()):
                        break
                    continue
                if not await _send_snapshot(ws, redis, table_id, player_id, snapshot):
                    break
                repo.update_last_seen(redis, table_id, player_id)
                await _flush_events(redis, table_id, events)
                _cleanup_if_session_ended(redis, table_id, snapshot)
                continue

            if isinstance(msg, VoteContinue):
                try:
                    snapshot = handle_vote_continue(
                        redis,
                        table_id,
                        player_id,
                        msg.vote.value,
                        msg.request_id,
                        emit=emit,
                    )
                except ValueError as exc:
                    err = ErrorMessage(code="VOTE_DENIED", message=str(exc))
                    if not await _safe_send_json(ws, err.model_dump()):
                        break
                    continue
                if not await _send_snapshot(ws, redis, table_id, player_id, snapshot):
                    break
                repo.update_last_seen(redis, table_id, player_id)
                await _flush_events(redis, table_id, events)
                _cleanup_if_session_ended(redis, table_id, snapshot)
                continue

            if isinstance(msg, Sync):
                if table_id is None:
                    err = ErrorMessage(code="JOIN_REQUIRED", message="Send JOIN_TABLE before SYNC")
                    if not await _safe_send_json(ws, err.model_dump()):
                        break
                    continue
                snapshot = repo.get_snapshot(redis, table_id)
                if not await _send_snapshot(ws, redis, table_id, player_id, snapshot):
                    break
                event_list = stream.read_events(redis, table_id, msg.last_event_id)
                ws_seat = repo.get_seat_for_player(redis, table_id, player_id) or 0
                send_failed = False
                for event in event_list:
                    payload = event.get("payload") or {}
                    event_type = event.get("type") or ""
                    personalized_payload = _personalize_event_payload(
                        redis, table_id, event_type, payload, ws_seat
                    )
                    if personalized_payload is None:
                        continue
                    if not await _safe_send_json(
                        ws,
                        {
                            **event,
                            "payload": personalized_payload,
                        },
                    ):
                        send_failed = True
                        break
                if send_failed:
                    break
                continue

            err = ErrorMessage(
                code="UNHANDLED",
                message=f"{msg.type} not implemented yet",
            )
            if not await _safe_send_json(ws, err.model_dump()):
                break
    except WebSocketDisconnect:
        pass
    finally:
        if table_id and player_id:
            try:
                repo.mark_disconnected(redis, table_id, player_id)
            except Exception:
                pass
        manager.disconnect(ws)


async def _flush_events(
    redis, table_id: str, events: List[Tuple[str, Dict[str, Any]]]
) -> None:
    if not events:
        return
    meta = repo.get_meta(redis, table_id)
    session_id = meta.get("session_id", "")
    round_id = int(meta.get("round_id", "0") or 0)
    for event_type, payload in events:
        await append_and_broadcast(redis, table_id, event_type, session_id, round_id, payload)


async def _send_snapshot(
    ws: WebSocket,
    redis,
    table_id: str,
    player_id: str | None,
    snapshot: Dict[str, Any],
) -> bool:
    personalized = _personalize_snapshot(redis, table_id, player_id, snapshot)
    return await _safe_send_json(ws, {"type": "SNAPSHOT", **personalized})


def _cleanup_if_session_ended(redis, table_id: str, snapshot: Dict[str, Any]) -> None:
    meta = snapshot.get("meta") or {}
    if meta.get("phase") == "SESSION_ENDED":
        repo.clear_table(redis, table_id)
