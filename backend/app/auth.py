"""Resolve temporary anonymous browser sessions for the live demo."""
from __future__ import annotations

from uuid import UUID

from fastapi import Header, HTTPException


async def current_user_id(authorization: str | None = Header(default=None)) -> str:
    """Use a random per-browser namespace; this is not account authentication."""
    if not authorization:
        # Preserve local/test clients that do not send browser session headers.
        return "local-user"
    if authorization and authorization.lower().startswith("bearer demo:"):
        raw_id = authorization[12:].strip()
        try:
            return f"demo-{UUID(raw_id)}"
        except ValueError:
            pass
    raise HTTPException(status_code=401, detail={"error": {"code": "invalid_demo_session", "message": "Refresh the page to start a demo session."}})
