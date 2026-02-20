import uuid
from contextlib import contextmanager

from redis import Redis

from app.infra.redis import keys


_RELEASE_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"""


@contextmanager
def table_lock(redis: Redis, tid: str, ttl_ms: int = 5000):
    lock_key = keys.table_lock(tid)
    token = str(uuid.uuid4())
    acquired = redis.set(lock_key, token, nx=True, px=ttl_ms)
    if not acquired:
        raise ValueError("Table is busy, try again")
    try:
        yield
    finally:
        try:
            redis.eval(_RELEASE_SCRIPT, 1, lock_key, token)
        except Exception:
            pass
