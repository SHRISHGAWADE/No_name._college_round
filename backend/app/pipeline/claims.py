"""Claim extraction stage (P1).

LLM call → structured JSON list of {text, span_text}.
Offsets are resolved via locate_span() — never trusted from the LLM.
Malformed LLM output never crashes the audit (claim gets status="error").
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import List, Optional

from pydantic import BaseModel, ValidationError

from app.models import Claim, AnswerSpan
from app.prompts.claims import EXTRACT_SYSTEM
from app.validation.spans import locate_span
from app.validation.text import normalize_text
from app.pipeline.cache import get_cache
from app import config

log = logging.getLogger(__name__)

MAX_CLAIMS = config.MAX_CLAIMS


class _RawClaim(BaseModel):
    text: str
    span_text: str


class _RawClaimList(BaseModel):
    root: List[_RawClaim]


async def extract_claims(
    answer_text: str,
    client,
    model: str,
) -> List[Claim]:
    """Call the LLM to decompose answer_text into atomic claims."""
    prompt = (
        f"{EXTRACT_SYSTEM}\n\n"
        f"<answer>\n{answer_text}\n</answer>"
    )

    # Check disk cache first
    cache = get_cache()
    cached_json = cache.get(model, prompt)

    if cached_json is None:
        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "temperature": 0,
                },
            )
            cached_json = response.text or "[]"
            cache.set(model, prompt, cached_json)
        except Exception as exc:
            log.error("claim extraction LLM call failed: %s", exc)
            return []

    # Parse
    raw_list: List[_RawClaim] = []
    try:
        parsed = json.loads(cached_json)
        if isinstance(parsed, list):
            raw_list = [_RawClaim(**item) for item in parsed[:MAX_CLAIMS]]
    except (json.JSONDecodeError, ValidationError, TypeError) as exc:
        log.error("claim extraction parse error: %s | raw=%r", exc, cached_json[:200])
        return []

    claims: List[Claim] = []
    for i, raw in enumerate(raw_list, start=1):
        claim_id = f"c{i}"
        span: Optional[AnswerSpan] = None
        flags: List[str] = []

        loc = locate_span(answer_text, raw.span_text)
        if loc:
            span = AnswerSpan(start=loc[0], end=loc[1])
        else:
            flags.append("span_not_located")
            log.debug("span not located for claim %s: %r", claim_id, raw.span_text)

        claims.append(Claim(
            claim_id=claim_id,
            text=raw.text,
            answer_span=span,
            status="pending",
            flags=flags,
        ))

    if len(raw_list) >= MAX_CLAIMS:
        log.info("claim cap hit (%d); kept first %d", len(raw_list), MAX_CLAIMS)

    return claims
