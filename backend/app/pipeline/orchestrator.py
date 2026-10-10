"""Main audit orchestration (P1).

Pipeline: extract_claims → build_retrieval_index → (parallel) verdict+validate → assemble.

Features:
  - asyncio.gather with Semaphore(4) and per-claim timeout of 30 s.
  - SSE event streaming: push "claims" (pending) then each "claim" (done).
  - AuditStore updated after every claim so polling fallback works.
  - Disk cache on LLM calls.
  - audit_single_claim() exported for P2's correction re-audit.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from google import genai

from app import config
from app.models import (
    AuditResult, Claim, Source, Trace, TraceStage,
    compute_summary,
)
from app.pipeline.claims import ClaimExtractionError, extract_claims
from app.pipeline.retrieval import RetrievalIndex
from app.pipeline.verdict import evaluate_claim
from app.features.answer_checks import run_answer_checks
from app.store import store

log = logging.getLogger(__name__)


def _make_client() -> genai.Client:
    return genai.Client(api_key=config.GEMINI_API_KEY)


async def run_audit(audit_id: str, answer_text: str, source_ids: List[str]) -> None:
    """Background task: full pipeline, updates store and streams events."""
    t_total_start = time.monotonic()
    stage_times: List[TraceStage] = []
    client = _make_client()

    sources: List[Source] = store.get_sources(source_ids)
    sources_by_id: Dict[str, Source] = {s.source_id: s for s in sources}

    # ── 1. Claim extraction ───────────────────────────────────────────────
    t0 = time.monotonic()
    try:
        claims = await extract_claims(answer_text, client, config.GENERATION_MODEL)
    except ClaimExtractionError as exc:
        log.error("claim extraction crashed: %s", exc)
        await _mark_error(audit_id, "claim_extraction_failed", "Claim extraction could not be completed.")
        return
    except Exception as exc:
        log.error("claim extraction crashed: %s", exc)
        await _mark_error(audit_id, "claim_extraction_failed", "Claim extraction could not be completed.")
        return
    stage_times.append(TraceStage(name="extract_claims", ms=int((time.monotonic() - t0) * 1000)))

    if not claims:
        # A valid empty JSON list is distinct from malformed model output.
        # It is a completed audit with no factual claims, not an error event.
        log.info("no factual claims extracted for audit %s", audit_id)
        _finish(audit_id, [], [], stage_times, t_total_start, answer_text, source_ids)
        return

    # Emit pending claims (streaming)
    await store.push_event(audit_id, "claims", {"claims": [c.model_dump() for c in claims]})

    # Update store with pending claims
    result = store.get_audit(audit_id)
    if result:
        result.claims = claims
        store.set_audit(audit_id, result)

    # ── 2. Build retrieval index (embed all sources once) ─────────────────
    t0 = time.monotonic()
    try:
        index = await RetrievalIndex.build(sources, client, config.EMBEDDING_MODEL)
    except Exception as exc:
        log.error("retrieval index build failed: %s", exc)
        index = None
    stage_times.append(TraceStage(name="retrieve", ms=int((time.monotonic() - t0) * 1000)))

    # ── 3. Parallel verdict evaluation ────────────────────────────────────
    t0 = time.monotonic()
    sem = asyncio.Semaphore(config.RETRIEVE_SEMAPHORE)

    async def process_claim(claim: Claim) -> Claim:
        async with sem:
            try:
                if index is not None:
                    chunks, ret_score = await asyncio.wait_for(
                        index.retrieve(claim.text, client, config.EMBEDDING_MODEL, top_k=config.RETRIEVAL_TOP_K),
                        timeout=config.VERDICT_TIMEOUT_S,
                    )
                else:
                    chunks, ret_score = [], 0.0

                done_claim = await asyncio.wait_for(
                    evaluate_claim(
                        claim=claim,
                        chunks=chunks,
                        sources_by_id=sources_by_id,
                        retrieval_score=ret_score,
                        client=client,
                        model=config.GENERATION_MODEL,
                    ),
                    timeout=config.VERDICT_TIMEOUT_S,
                )
            except asyncio.TimeoutError:
                log.warning("claim %s timed out", claim.claim_id)
                done_claim = claim.model_copy(update={"status": "error", "flags": claim.flags + ["timeout"]})
            except Exception as exc:
                log.error("claim %s error: %s", claim.claim_id, exc)
                done_claim = claim.model_copy(update={"status": "error", "flags": claim.flags + ["pipeline_error"]})

            # Stream and persist immediately
            await store.push_event(audit_id, "claim", done_claim.model_dump())
            result = store.get_audit(audit_id)
            if result:
                result.claims = [
                    done_claim if c.claim_id == done_claim.claim_id else c
                    for c in result.claims
                ]
                store.set_audit(audit_id, result)

            return done_claim

    completed_claims: List[Claim] = await asyncio.gather(
        *[process_claim(c) for c in claims]
    )
    # Restore answer-order (gather preserves input order)
    stage_times.append(TraceStage(name="verdicts", ms=int((time.monotonic() - t0) * 1000)))

    # ── 4. Validate (already done inside evaluate_claim) ─────────────────
    stage_times.append(TraceStage(name="validate", ms=0))

    # ── 5. Answer-level checks ────────────────────────────────────────────
    t0 = time.monotonic()
    findings = await run_answer_checks(
        answer_text, completed_claims, client, config.GENERATION_MODEL
    )
    stage_times.append(TraceStage(name="answer_checks", ms=int((time.monotonic() - t0) * 1000)))

    if findings:
        await store.push_event(audit_id, "findings", {"answer_findings": [f.model_dump() for f in findings]})

    # ── 6. Assemble & finish ──────────────────────────────────────────────
    _finish(audit_id, completed_claims, findings, stage_times, t_total_start, answer_text, source_ids)


def _finish(
    audit_id: str,
    claims: List[Claim],
    findings,
    stage_times: List[TraceStage],
    t_total_start: float,
    answer_text: str,
    source_ids: List[str],
) -> None:
    import asyncio

    summary = compute_summary(claims)
    total_ms = int((time.monotonic() - t_total_start) * 1000)
    trace = Trace(
        model=config.GENERATION_MODEL,
        total_ms=total_ms,
        stages=stage_times,
    )

    result = AuditResult(
        audit_id=audit_id,
        status="done",
        created_at=datetime.now(timezone.utc).isoformat(),
        answer_text=answer_text,
        source_ids=source_ids,
        claims=claims,
        answer_findings=findings,
        summary=summary,
        trace=trace,
    )
    store.set_audit(audit_id, result)

    # fire-and-forget SSE done event
    loop = asyncio.get_event_loop()
    if loop.is_running():
        asyncio.ensure_future(store.push_event(audit_id, "done", {"summary": summary.model_dump()}))

    log.info("audit %s done in %d ms — %d claims", audit_id, total_ms, len(claims))


async def _mark_error(audit_id: str, code: str, message: str) -> None:
    result = store.get_audit(audit_id)
    if result:
        result.status = "error"
        store.set_audit(audit_id, result)
    log.error("audit %s error: %s", audit_id, message)
    await store.push_event(audit_id, "error", {"error": {"code": code, "message": message}})


# ── Single-claim audit (exported for correction re-audit) ─────────────────

async def audit_single_claim(claim_text: str, source_ids: List[str]) -> Claim:
    """Audit one claim in isolation; used by the correction endpoint."""
    from app.models import Claim as ClaimModel, AnswerSpan
    from app.pipeline.claims import _RawClaim
    from app.validation.spans import locate_span

    client = _make_client()
    sources: List[Source] = store.get_sources(source_ids)
    sources_by_id = {s.source_id: s for s in sources}

    # Build a minimal claim object
    span = locate_span(claim_text, claim_text)
    answer_span = AnswerSpan(start=span[0], end=span[1]) if span else None
    temp_claim = ClaimModel(
        claim_id="recheck_1",
        text=claim_text,
        answer_span=answer_span,
        status="pending",
    )

    try:
        index = await RetrievalIndex.build(sources, client, config.EMBEDDING_MODEL)
        chunks, ret_score = await index.retrieve(
            claim_text, client, config.EMBEDDING_MODEL, top_k=config.RETRIEVAL_TOP_K
        )
    except Exception:
        chunks, ret_score = [], 0.0

    return await evaluate_claim(
        claim=temp_claim,
        chunks=chunks,
        sources_by_id=sources_by_id,
        retrieval_score=ret_score,
        client=client,
        model=config.GENERATION_MODEL,
    )
