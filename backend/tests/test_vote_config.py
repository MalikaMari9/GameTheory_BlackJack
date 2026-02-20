import time

import pytest

from app.config import Settings, settings
from app.infra.redis.client import get_redis
from app.infra.redis import repo
from app.services import round_service
from tests.conftest import redis_available


@pytest.mark.skipif(not redis_available(), reason="Redis not available")
def test_vote_tie_respects_tie_result(monkeypatch, table_id: str) -> None:
    redis = get_redis()
    repo.ensure_table(redis, table_id)
    repo.set_meta(
        redis,
        table_id,
        {"phase": "VOTE_CONTINUE", "round_id": 1, "vote_deadline_ts": int(time.time() * 1000) - 1},
    )

    # Two players, one YES one NO -> tie
    repo.upsert_player(redis, table_id, "p1", 1, "A", "t1")
    repo.upsert_player(redis, table_id, "p2", 2, "B", "t2")
    repo.cast_vote(redis, table_id, 1, "p1", "yes")
    repo.cast_vote(redis, table_id, 1, "p2", "no")

    data = settings.__dict__.copy()
    data.update({"tie_result": "END"})
    monkeypatch.setattr(round_service, "settings", Settings(**data))
    round_service.finalize_vote(redis, table_id, force_timeout=True)
    meta = repo.get_meta(redis, table_id)
    assert meta["phase"] == "SESSION_ENDED"


@pytest.mark.skipif(not redis_available(), reason="Redis not available")
def test_no_vote_counts_as_config(monkeypatch, table_id: str) -> None:
    redis = get_redis()
    repo.ensure_table(redis, table_id)
    repo.set_meta(
        redis,
        table_id,
        {"phase": "VOTE_CONTINUE", "round_id": 1, "vote_deadline_ts": int(time.time() * 1000) - 1},
    )

    repo.upsert_player(redis, table_id, "p1", 1, "A", "t1")
    repo.upsert_player(redis, table_id, "p2", 2, "B", "t2")
    # Only one vote recorded
    repo.cast_vote(redis, table_id, 1, "p1", "yes")

    data = settings.__dict__.copy()
    data.update({"no_vote_counts_as": "YES"})
    monkeypatch.setattr(round_service, "settings", Settings(**data))
    round_service.finalize_vote(redis, table_id, force_timeout=True)
    meta = repo.get_meta(redis, table_id)
    assert meta["phase"] == "WAITING_FOR_BETS"
