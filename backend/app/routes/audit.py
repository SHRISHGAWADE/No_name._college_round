"""Audit routes — create, poll, stream, correct (P1 owns this file).

POST /api/audit               → start background pipeline, return audit_id
GET  /api/audit/{id}          → current AuditResult (polling fallback)
GET  /api/audit/{id}/stream   → SSE stream of claim events
POST /api/audit/{id}/claims/{cid}/correct → correction + re-audit
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import StreamingResponse

from app import config
from app.models import (
    AuditCreateRequest, AuditCreateResponse, AuditResult,
    CorrectionResponse,
)
from app.store import store
from app.rate_limit import limiter
from app.validation.text import normalize_text

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/audit", tags=["audit"])

# Lazy import so tests that don't set GEMINI_API_KEY still import the module
def _get_orchestrator():
    from app.pipeline.orchestrator import run_audit
    return run_audit

def _get_correction():
    from app.features.correction import generate_correction
    from app.pipeline.orchestrator import audit_single_claim
    return generate_correction, audit_single_claim


# ── Create audit ──────────────────────────────────────────────────────────

@router.post("", response_model=AuditCreateResponse)
@limiter.limit(config.RATE_LIMIT)
async def create_audit(
    payload: AuditCreateRequest,
    background_tasks: BackgroundTasks,
    request: Request,
) -> AuditCreateResponse:
    request_id: str = getattr(request.state, "request_id", "-")
    answer = normalize_text(payload.answer)

    if not answer.strip():
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "empty_answer", "message": "Answer cannot be empty."}},
        )
    if len(answer) > config.MAX_ANSWER_CHARS:
        raise HTTPException(
            status_code=422,
            detail={"error": {
                "code": "answer_too_long",
                "message": f"Answer exceeds {config.MAX_ANSWER_CHARS} character limit.",
            }},
        )

    # Verify source IDs exist
    missing = [sid for sid in payload.source_ids if store.get_source(sid) is None]
    if missing:
        raise HTTPException(
            status_code=422,
            detail={"error": {
                "code": "unknown_sources",
                "message": f"Source IDs not found: {missing}. Upload sources first.",
            }},
        )

    audit_id = f"a_{uuid.uuid4().hex[:8]}"
    initial = AuditResult(
        audit_id=audit_id,
        status="running",
        created_at=datetime.now(timezone.utc).isoformat(),
        answer_text=answer,
        source_ids=payload.source_ids,
    )
    store.set_audit(audit_id, initial)
    store.get_or_create_queue(audit_id)  # create queue before background task

    if config.MOCK_MODE:
        background_tasks.add_task(_mock_pipeline, audit_id, answer, payload.source_ids)
    else:
        run_audit = _get_orchestrator()
        background_tasks.add_task(run_audit, audit_id, answer, payload.source_ids)

    log.info("audit_created audit_id=%s request_id=%s sources=%s", audit_id, request_id, payload.source_ids)
    return AuditCreateResponse(audit_id=audit_id)


# ── Poll ──────────────────────────────────────────────────────────────────

@router.get("/{audit_id}", response_model=AuditResult)
async def get_audit(audit_id: str) -> AuditResult:
    result = store.get_audit(audit_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "not_found", "message": f"Audit '{audit_id}' not found."}},
        )
    return result


# ── SSE stream ────────────────────────────────────────────────────────────

@router.get("/{audit_id}/stream")
async def stream_audit(audit_id: str) -> StreamingResponse:
    # Ensure the audit exists
    result = store.get_audit(audit_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "not_found", "message": f"Audit '{audit_id}' not found."}},
        )

    queue = store.get_or_create_queue(audit_id)

    async def event_gen() -> AsyncGenerator[str, None]:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=25.0)
                name = event["event"]
                data = json.dumps(event["data"])
                yield f"event: {name}\ndata: {data}\n\n"
                if name in ("done", "error"):
                    break
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"
            except Exception as exc:
                log.error("SSE error for %s: %s", audit_id, exc)
                break

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Correction ────────────────────────────────────────────────────────────

@router.post("/{audit_id}/claims/{claim_id}/correct", response_model=CorrectionResponse)
async def correct_claim(audit_id: str, claim_id: str) -> CorrectionResponse:
    result = store.get_audit(audit_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "not_found", "message": f"Audit '{audit_id}' not found."}},
        )

    claim = next((c for c in result.claims if c.claim_id == claim_id), None)
    if claim is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "claim_not_found", "message": f"Claim '{claim_id}' not found."}},
        )

    from google import genai
    client = genai.Client(api_key=config.GEMINI_API_KEY)
    generate_correction, audit_single_claim = _get_correction()

    return await generate_correction(
        claim=claim,
        source_ids=result.source_ids,
        genai_client=client,
        model=config.GENERATION_MODEL,
        audit_single_claim_fn=audit_single_claim,
    )


# ── Mock pipeline (MOCK=1 mode) ───────────────────────────────────────────

async def _mock_pipeline(audit_id: str, answer_text: str, source_ids: list) -> None:
    """Serve canned mock data with realistic delays for frontend dev."""
    import os
    import pathlib

    # Find mock/audit.json
    base = pathlib.Path(__file__).parent.parent.parent.parent
    mock_paths = [
        base / "mock" / "audit.json",
        base / "docs" / "mock" / "audit.json",
    ]
    mock_data: dict = {}
    for p in mock_paths:
        if p.exists():
            mock_data = json.loads(p.read_text(encoding="utf-8"))
            break

    if not mock_data:
        log.error("MOCK=1 but mock/audit.json not found")
        _error_result(audit_id, answer_text, source_ids, "mock_data_missing")
        return

    from app.models import Claim as ClaimModel
    claims = [ClaimModel(**c) for c in mock_data.get("claims", [])]

    # Emit pending
    pending = [c.model_copy(update={"status": "pending", "verdict": None}) for c in claims]
    await store.push_event(audit_id, "claims", {"claims": [c.model_dump() for c in pending]})

    result = store.get_audit(audit_id)
    if result:
        result.claims = pending
        store.set_audit(audit_id, result)

    # Emit one by one
    for claim in claims:
        await asyncio.sleep(0.5)
        await store.push_event(audit_id, "claim", claim.model_dump())
        result = store.get_audit(audit_id)
        if result:
            result.claims = [
                claim if c.claim_id == claim.claim_id else c for c in result.claims
            ]
            store.set_audit(audit_id, result)

    summary = mock_data.get("summary")
    from app.models import Summary, SummaryCounts
    sum_obj = Summary(**summary) if summary else None

    final = AuditResult(
        audit_id=audit_id,
        status="done",
        created_at=datetime.now(timezone.utc).isoformat(),
        answer_text=answer_text,
        source_ids=source_ids,
        claims=claims,
        answer_findings=[],
        summary=sum_obj,
        trace=None,
    )
    store.set_audit(audit_id, final)
    await store.push_event(audit_id, "done", {"summary": summary})


def _error_result(audit_id: str, answer_text: str, source_ids: list, code: str) -> None:
    result = store.get_audit(audit_id)
    if result:
        result.status = "error"
        store.set_audit(audit_id, result)
