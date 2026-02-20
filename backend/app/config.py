import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    table_id: str = os.getenv("BJ_TABLE_ID", "default")
    seat_count: int = int(os.getenv("BJ_SEAT_COUNT", "5"))

    # Gameplay defaults (MVP)
    shoe_decks: int = int(os.getenv("BJ_SHOE_DECKS", "6"))
    reshuffle_when_remaining_pct: float = float(
        os.getenv("BJ_RESHUFFLE_WHEN_REMAINING_PCT", "0.25")
    )
    dealer_soft_17_mode: str = os.getenv("BJ_DEALER_SOFT_17_MODE", "RANDOM_PER_ROUND")
    blackjack_payout: float = float(os.getenv("BJ_BLACKJACK_PAYOUT", "1.5"))  # 3/2
    starting_bankroll: int = int(os.getenv("BJ_STARTING_BANKROLL", "1000"))
    min_bet: int = int(os.getenv("BJ_MIN_BET", "10"))
    max_bet: int = int(os.getenv("BJ_MAX_BET", "200"))
    bet_time_seconds: int = int(os.getenv("BJ_BET_TIME_SECONDS", "0"))
    vote_time_seconds: int = int(os.getenv("BJ_VOTE_TIME_SECONDS", "15"))
    reconnect_grace_seconds: int = int(os.getenv("BJ_RECONNECT_GRACE_SECONDS", "300"))
    min_players_to_start: int = int(os.getenv("BJ_MIN_PLAYERS_TO_START", "2"))
    require_ready: bool = os.getenv("BJ_REQUIRE_READY", "true").lower() == "true"
    allow_join_during_session: bool = (
        os.getenv("BJ_ALLOW_JOIN_DURING_SESSION", "false").lower() == "true"
    )
    no_bet_behavior: str = os.getenv("BJ_NO_BET_BEHAVIOR", "SIT_OUT_ROUND")
    no_vote_counts_as: str = os.getenv("BJ_NO_VOTE_COUNTS_AS", "NO")
    tie_result: str = os.getenv("BJ_TIE_RESULT", "CONTINUE")
    auto_end_if_no_active_bettors: bool = (
        os.getenv("BJ_AUTO_END_IF_NO_ACTIVE_BETTORS", "true").lower() == "true"
    )
    show_dealer_rule: bool = os.getenv("BJ_SHOW_DEALER_RULE", "true").lower() == "true"
    bust_pause_ms: int = int(os.getenv("BJ_BUST_PAUSE_MS", "1000"))


settings = Settings()
