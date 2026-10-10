"""Shared rate limiter used by FastAPI routes and application setup."""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app import config

limiter = Limiter(
    key_func=get_remote_address,
    enabled=not config.RATE_LIMIT_DISABLED,
)
