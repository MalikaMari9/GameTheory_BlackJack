from typing import Any, Dict, Optional, Type, Literal

from pydantic import BaseModel
from app.domain.models.types import Action, Vote


class ClientMessage(BaseModel):
    type: str


class Hello(ClientMessage):
    type: Literal["HELLO"]
    nickname: str
    reconnect_token: Optional[str] = None


class JoinTable(ClientMessage):
    type: Literal["JOIN_TABLE"]
    table_id: str


class ReadyToggle(ClientMessage):
    type: Literal["READY_TOGGLE"]


class StartSession(ClientMessage):
    type: Literal["START_SESSION"]


class PlaceBet(ClientMessage):
    type: Literal["PLACE_BET"]
    amount: int
    request_id: str


class ActionMessage(ClientMessage):
    type: Literal["ACTION"]
    action: Action
    request_id: str


class VoteContinue(ClientMessage):
    type: Literal["VOTE_CONTINUE"]
    vote: Vote
    request_id: str


class Sync(ClientMessage):
    type: Literal["SYNC"]
    last_event_id: Optional[str] = None


class AdminConfig(ClientMessage):
    type: Literal["ADMIN_CONFIG"]
    starting_bankroll: Optional[int] = None
    min_bet: Optional[int] = None
    max_bet: Optional[int] = None
    shoe_decks: Optional[int] = None
    reshuffle_when_remaining_pct: Optional[float] = None


class ServerMessage(BaseModel):
    type: str


class Welcome(ServerMessage):
    type: Literal["WELCOME"] = "WELCOME"
    player_id: str
    reconnect_token: str


class SessionEnd(ServerMessage):
    type: Literal["SESSION_ENDED"] = "SESSION_ENDED"


class Snapshot(ServerMessage):
    type: Literal["SNAPSHOT"] = "SNAPSHOT"
    meta: Dict[str, Any]
    seats: Dict[str, Any]
    players: Dict[str, Any]
    dealer_hand: Dict[str, Any]
    public_round_state: Dict[str, Any]


class Event(BaseModel):
    type: str
    event_id: str
    session_id: str
    round_id: int
    payload: Dict[str, Any]


class ErrorMessage(ServerMessage):
    type: Literal["ERROR"] = "ERROR"
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


CLIENT_MESSAGE_MODELS: Dict[str, Type[ClientMessage]] = {
    "HELLO": Hello,
    "JOIN_TABLE": JoinTable,
    "READY_TOGGLE": ReadyToggle,
    "START_SESSION": StartSession,
    "PLACE_BET": PlaceBet,
    "ACTION": ActionMessage,
    "VOTE_CONTINUE": VoteContinue,
    "SYNC": Sync,
    "ADMIN_CONFIG": AdminConfig,
}


def parse_client_message(payload: Dict[str, Any]) -> ClientMessage:
    msg_type = payload.get("type")
    if not msg_type or msg_type not in CLIENT_MESSAGE_MODELS:
        raise ValueError("Unknown or missing message type")
    model = CLIENT_MESSAGE_MODELS[msg_type]
    return model.model_validate(payload)
