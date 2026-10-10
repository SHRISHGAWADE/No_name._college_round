"""Verdict evaluation stage (P1).

Per claim:
  1. Build a labelled passage block from the top-k retrieved chunks.
  2. Call the LLM for a structured verdict.
  3. Call P2's verify_quote() on the returned quote — EXACT match, no fuzzy.
  4. If quote fails: retry once with a stricter reminder.
  5. If it still fails: drop evidence, set verdict=unsupported, add flag evidence_unverified.
  6. Assemble final Claim with confidence score.

Injection hardening: claim and passages wrapped in XML tags; model told
content inside tags is data, never instructions.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ValidationError

from app.models import Claim, Evidence, AnswerSpan, Signals
from app.prompts.verdict import build_verdict_prompt
from app.validation.quotes import verify_quote
from app.features.confidence import compute_confidence
from app.pipeline.cache import get_cache
from app.pipeline.retrieval import RETRIEVAL_LOW_THRESHOLD

log = logging.getLogger(__name__)

VALID_VERDICTS = {"supported", "contradicted", "unsupported", "ambiguous"}
VALID_ERROR_TYPES = {
    "wrong_number", "contradiction", "fabricated_fact",
    "unsupported_addition", "logical_leap", "unsafe_advice",
}


class _VerdictOutput(BaseModel):
    verdict: str
    error_type: Optional[str] = None
    passage_id: str = ""
    quote: str = ""
    explanation: str = ""


async def evaluate_claim(
    claim: Claim,
    chunks: List[Dict[str, Any]],
    sources_by_id: Dict[str, Any],  # source_id → Source
    retrieval_score: Optional[float],
    client,
    model: str,
) -> Claim:
    """Run verdict + quote verification for a single claim."""

    # Build passage block
    passage_lines = []
    for i, chunk in enumerate(chunks, start=1):
        src_name = chunk.get("source_name", chunk.get("source_id", "?"))
        page = chunk.get("page", 1)
        text = chunk.get("text", "")
        passage_lines.append((f"p{i}", src_name, page, text))

    prompt = build_verdict_prompt(claim.text, passage_lines)

    verdict_output = await _call_verdict_llm(prompt, client, model)

    if verdict_output is None:
        return claim.model_copy(update={"status": "error", "flags": claim.flags + ["llm_error"]})

    # Validate verdict literal
    raw_verdict = verdict_output.verdict.lower().strip()
    if raw_verdict not in VALID_VERDICTS:
        raw_verdict = "unsupported"

    raw_error_type: Optional[str] = verdict_output.error_type
    if raw_error_type and raw_error_type not in VALID_ERROR_TYPES:
        raw_error_type = None

    # ── Quote verification (P2, exact-only) ──────────────────────────────
    quote = verdict_output.quote.strip()
    flags = list(claim.flags)
    evidence: List[Evidence] = []
    quote_verified_flag = False

    if quote:
        preferred_source = None
        if verdict_output.passage_id.startswith("p"):
            try:
                passage_index = int(verdict_output.passage_id[1:]) - 1
                if 0 <= passage_index < len(chunks):
                    preferred_source = sources_by_id.get(chunks[passage_index].get("source_id"))
            except ValueError:
                pass

        candidate_sources = ([preferred_source] if preferred_source else []) + [
            source for source in sources_by_id.values() if source is not preferred_source
        ]
        matched_source = None
        match = None
        for source in candidate_sources:
            match = verify_quote(quote, source.pages)
            if match:
                matched_source = source
                break

        if match is None:
            # Retry once with stricter reminder
            retry_prompt = prompt + (
                "\n\nIMPORTANT CORRECTION: Your previous quote did not match the source "
                "character for character. You MUST copy the quote exactly as it appears in "
                "the passage — same spacing, same punctuation, same case.  Try again."
            )
            verdict_output2 = await _call_verdict_llm(retry_prompt, client, model, skip_cache=True)
            if verdict_output2 and verdict_output2.quote.strip():
                retry_quote = verdict_output2.quote.strip()
                for source in candidate_sources:
                    match = verify_quote(retry_quote, source.pages)
                    if match:
                        matched_source = source
                        break
                if match:
                    quote = retry_quote
                    verdict_output = verdict_output2
                    raw_verdict = verdict_output.verdict.lower().strip()
                    if raw_verdict not in VALID_VERDICTS:
                        raw_verdict = "unsupported"
                    raw_error_type = verdict_output.error_type
                    if raw_error_type and raw_error_type not in VALID_ERROR_TYPES:
                        raw_error_type = None

        if match and matched_source:
            matched_page = next((page for page in matched_source.pages if page.page == match.page), None)
            if matched_page is None:
                # A QuoteMatch must always identify a page from the source it
                # was verified against.  Do not display evidence if that
                # invariant is ever broken.
                flags.append("evidence_unverified")
                raw_verdict = "unsupported"
            else:
                # The verifier permits a small, deterministic normalization
                # set (for example PDF whitespace and curly punctuation), but
                # the API contract requires displayed evidence to be the exact
                # original source text at the returned offsets.
                quote = matched_page.text[match.start : match.end]
                evidence.append(Evidence(
                    source_id=matched_source.source_id,
                    source_name=matched_source.name,
                    page=match.page,
                    quote=quote,
                    start=match.start,
                    end=match.end,
                    quote_verified=True,
                ))
                quote_verified_flag = True
        else:
            flags.append("evidence_unverified")
            raw_verdict = "unsupported"  # per contract rule
            log.debug("quote not verified; downgrading to unsupported for claim %s", claim.claim_id)
    elif raw_verdict in {"supported", "contradicted"}:
        # Positive and negative factual findings require a verifiable passage.
        flags.append("evidence_unverified")
        raw_verdict = "unsupported"

    # Low retrieval flag
    if retrieval_score is not None and retrieval_score < RETRIEVAL_LOW_THRESHOLD:
        flags.append("low_retrieval")

    # Confidence
    confidence, confidence_label = compute_confidence(
        quote_verified=quote_verified_flag,
        agreement_ratio=1.0,   # single run; self-consistency optional
        retrieval_score=retrieval_score if retrieval_score is not None else 0.5,
        verdict=raw_verdict,
    )

    signals = Signals(
        quote_verified=quote_verified_flag if quote else None,
        retrieval_score=round(retrieval_score, 4) if retrieval_score is not None else None,
        agreement=None,
        jev=None,
        hhem=None,
    )

    return claim.model_copy(update={
        "status": "done",
        "verdict": raw_verdict,
        "error_type": raw_error_type,
        "flags": flags,
        "confidence": confidence,
        "confidence_label": confidence_label,
        "explanation": verdict_output.explanation,
        "evidence": evidence,
        "signals": signals,
    })


async def _call_verdict_llm(
    prompt: str,
    client,
    model: str,
    skip_cache: bool = False,
) -> Optional[_VerdictOutput]:
    cache = get_cache()
    cached = None if skip_cache else cache.get(model, prompt)

    if cached is None:
        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "response_schema": _VerdictOutput,
                },
            )
            cached = response.text or "{}"
            if not skip_cache:
                cache.set(model, prompt, cached)
        except Exception as exc:
            log.error("verdict LLM call failed: %s", exc)
            return None

    try:
        data = json.loads(cached)
        return _VerdictOutput(**data)
    except (json.JSONDecodeError, ValidationError, TypeError) as exc:
        log.error("verdict parse error: %s | raw=%r", exc, cached[:200])
        return None
