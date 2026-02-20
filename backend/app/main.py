import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.ws.blackjack import router as blackjack_ws
from app.api.http.health import router as health_router
from app.api.http.strategy import router as strategy_router

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.config import settings
    from app.infra.redis.client import get_redis
    from app.infra.redis import repo
    from app.infra.redis import keys
    from app.infra.redis.locks import table_lock
    from app.services.round_service import (
        finalize_vote,
        finalize_bets,
        advance_pending_turn,
        advance_bust_pending,
        advance_double_pending,
        advance_inactive_turn,
        advance_dealer,
        advance_settle,
        advance_deal_pending,
        advance_turn_start,
    )
    from app.api.ws import blackjack as ws_module

    async def _loop() -> None:
        redis = get_redis()
        while True:
            try:
                table_ids = repo.get_tables(redis) or [settings.table_id]
                for tid in table_ids:
                    events: list[tuple[str, dict]] = []

                    def emit(event_type: str, payload: dict) -> None:
                        events.append((event_type, payload))

                    snap_vote = finalize_vote(redis, tid, force_timeout=False, emit=emit)
                    snap_bets = finalize_bets(redis, tid, force_timeout=False, emit=emit)
                    snap_pending = advance_pending_turn(redis, tid, emit=emit)
                    snap_bust = advance_bust_pending(redis, tid, emit=emit)
                    snap_double = advance_double_pending(redis, tid, emit=emit)
                    snap_inactive = advance_inactive_turn(redis, tid, emit=emit)
                    snap_deal_pending = advance_deal_pending(redis, tid, emit=emit)
                    snap_turn_start = advance_turn_start(redis, tid, emit=emit)
                    snap_dealer = advance_dealer(redis, tid, emit=emit)
                    snap_settle = advance_settle(redis, tid, emit=emit)
                    repo.cleanup_disconnected(
                        redis, tid, settings.reconnect_grace_seconds
                    )

                    # If a table has no players (after grace cleanup), clear it so a fresh join can
                    # recreate the room in LOBBY.
                    try:
                        if int(redis.scard(keys.table_players(tid)) or 0) == 0:
                            try:
                                with table_lock(redis, tid):
                                    if int(redis.scard(keys.table_players(tid)) or 0) == 0:
                                        repo.clear_table(redis, tid)
                                        continue
                            except Exception:
                                logger.exception("Failed while clearing empty table", extra={"table_id": tid})
                    except Exception:
                        logger.exception("Failed while checking empty table cleanup", extra={"table_id": tid})

                    if events:
                        meta = repo.get_meta(redis, tid)
                        session_id = meta.get("session_id", "")
                        round_id = int(meta.get("round_id", "0") or 0)
                        for event_type, payload in events:
                            await ws_module.append_and_broadcast(
                                redis, tid, event_type, session_id, round_id, payload
                            )
                        if (
                            snap_vote.get("meta", {}).get("phase") == "SESSION_ENDED"
                            or snap_bets.get("meta", {}).get("phase") == "SESSION_ENDED"
                            or snap_pending.get("meta", {}).get("phase") == "SESSION_ENDED"
                            or snap_bust.get("meta", {}).get("phase") == "SESSION_ENDED"
                            or snap_double.get("meta", {}).get("phase") == "SESSION_ENDED"
                            or snap_inactive.get("meta", {}).get("phase") == "SESSION_ENDED"
                            or snap_deal_pending.get("meta", {}).get("phase") == "SESSION_ENDED"
                            or snap_turn_start.get("meta", {}).get("phase") == "SESSION_ENDED"
                            or snap_dealer.get("meta", {}).get("phase") == "SESSION_ENDED"
                            or snap_settle.get("meta", {}).get("phase") == "SESSION_ENDED"
                        ):
                            repo.clear_table(redis, tid)
            except Exception:
                logger.exception("Background lifecycle loop error")
            await asyncio.sleep(1)

    task = asyncio.create_task(_loop())
    app.state.vote_task = task
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="Distributed Blackjack", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(strategy_router)
app.include_router(blackjack_ws)
