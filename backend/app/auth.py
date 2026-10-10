"""Verify Supabase access tokens and return the authenticated user ID."""
from __future__ import annotations

import httpx
from fastapi import Header, HTTPException

from app import config


async def current_user_id(authorization: str | None = Header(default=None)) -> str:
    # Local development and unit tests continue to work without a Supabase
    # project. When persistence is enabled, every user-facing data route is
    # authenticated against Supabase Auth before it touches stored data.
    if not config.SUPABASE_ENABLED and not config.SUPABASE_CONFIGURED:
        return "local-user"
    if not config.SUPABASE_ENABLED:
        raise HTTPException(status_code=503, detail={"error": {"code": "supabase_not_configured", "message": "Supabase URL, anon key, and service-role key must all be configured on the backend."}})
    if not config.SUPABASE_ANON_KEY:
        raise HTTPException(status_code=503, detail={"error": {"code": "auth_not_configured", "message": "Supabase Auth is not fully configured."}})
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail={"error": {"code": "unauthorized", "message": "Sign in to access your audits and sources."}})
    token = authorization[7:].strip()
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                f"{config.SUPABASE_URL}/auth/v1/user",
                headers={"apikey": config.SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
            )
        if response.status_code != 200:
            raise ValueError("token rejected")
        user_id = response.json().get("id")
        if not isinstance(user_id, str) or not user_id:
            raise ValueError("user id missing")
        return user_id
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(status_code=401, detail={"error": {"code": "unauthorized", "message": "Your session expired. Sign in again."}}) from exc
