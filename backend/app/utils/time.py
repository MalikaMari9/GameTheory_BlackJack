import time

def utc_ms() -> int:
    return int(time.time() * 1000)
