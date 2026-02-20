# Redis key builders


def table_meta(tid: str) -> str:
    return f"bj:table:{tid}:meta"


def table_players(tid: str) -> str:
    return f"bj:table:{tid}:players"


def table_seats(tid: str) -> str:
    return f"bj:table:{tid}:seats"


def table_ready(tid: str) -> str:
    return f"bj:table:{tid}:ready"


def table_player(tid: str, pid: str) -> str:
    return f"bj:table:{tid}:player:{pid}"


def table_hand(tid: str, hand_id: str) -> str:
    return f"bj:table:{tid}:hand:{hand_id}"


def table_shoe(tid: str) -> str:
    return f"bj:table:{tid}:shoe"


def table_shoe_meta(tid: str) -> str:
    return f"bj:table:{tid}:shoe:meta"


def table_vote(tid: str, round_id: int) -> str:
    return f"bj:table:{tid}:vote:{round_id}"


def table_events(tid: str) -> str:
    return f"bj:table:{tid}:events"


def table_request(tid: str, request_id: str) -> str:
    return f"bj:table:{tid}:req:{request_id}"


def reconnect_token(token: str) -> str:
    return f"bj:reconnect:{token}"


def tables_set() -> str:
    return "bj:tables"


def table_lock(tid: str) -> str:
    return f"bj:lock:{tid}"
