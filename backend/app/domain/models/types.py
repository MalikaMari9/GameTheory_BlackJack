from enum import Enum

class Phase(str, Enum):
    LOBBY = "LOBBY"
    WAITING_FOR_BETS = "WAITING_FOR_BETS"
    DEAL_INITIAL = "DEAL_INITIAL"
    PLAYER_TURNS = "PLAYER_TURNS"
    DEALER_TURN = "DEALER_TURN"
    SETTLE = "SETTLE"
    VOTE_CONTINUE = "VOTE_CONTINUE"

class Action(str, Enum):
    HIT = "hit"
    STAND = "stand"
    NEXT = "next"
    DOUBLE = "double"

class Vote(str, Enum):
    YES = "yes"
    NO = "no"
