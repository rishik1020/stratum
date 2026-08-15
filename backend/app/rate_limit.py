"""Request-rate limiting for the auth endpoints.

/auth/login had no limit at all — unlimited password guesses against any
account, forever. This bounds it per client IP.

In-memory, same as ws_manager's room state: fine for the single backend
instance this app runs today, and it resets on restart or per worker. If you
ever scale past one instance, move both to Redis together (slowapi supports a
Redis storage backend as a drop-in swap for the default).
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
