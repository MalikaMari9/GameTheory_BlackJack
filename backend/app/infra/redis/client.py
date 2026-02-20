from typing import Optional

from redis import Redis

from app.config import settings


def get_redis(url: Optional[str] = None) -> Redis:
    return Redis.from_url(url or settings.redis_url, decode_responses=True)
