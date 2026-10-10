"""Evidence-grounded claim correction + re-audit (P2).

Flow:
  1. Take a claim and its verified evidence.
  2. Prompt the LLM: rewrite the claim so it is fully supported by the
     evidence quote.  Never invent information.
  3. Call audit_single_claim() for the corrected sentence and return it
     as `recheck`.  recheck must come back "supported" for the UI to show
     the green badge.
  4. For unsupported claims (no evidence): corrected = null.
"""
from __future__ import annotations

import asyncio
import logging
from typing import List, Optional

from app.models import Claim, CorrectionResponse, Evidence

log = logging.getLogger(__name__)


async def generate_correction(
    claim: Claim,
    source_ids: List[str],
    genai_client,
    model: str,
    audit_single_claim_fn,   # async callable(text, source_ids) → Claim
) -> CorrectionResponse:
    """Return a CorrectionResponse; corrected may be None for unsupported."""

    if not claim.evidence:
        return CorrectionResponse(
            claim_id=claim.claim_id,
            original=claim.text,
            corrected=None,
            evidence=[],
            recheck=None,
        )

    # Build evidence context for the prompt
    evidence_block = "\n".join(
        f'[{ev.source_name}, page {ev.page}]: "{ev.quote}"'
        for ev in claim.evidence
    )

    prompt = (
        "You are a precision editor.  Your task: rewrite the claim below so that it is fully "
        "supported by the evidence quote(s).  Use ONLY information present in the quote(s). "
        "Do NOT invent or add any detail not in the quote.  "
        "If the evidence is insufficient to produce a correct statement, reply with exactly: CANNOT_FIX\n\n"
        f"Original claim: {claim.text}\n\n"
        f"Evidence:\n{evidence_block}\n\n"
        "Rewritten claim (one sentence):"
    )

    corrected: Optional[str] = None
    try:
        response = await asyncio.to_thread(
            genai_client.models.generate_content,
            model=model,
            contents=prompt,
            config={"temperature": 0},
        )
        raw = (response.text or "").strip()
        if raw and raw != "CANNOT_FIX":
            corrected = raw
    except Exception as exc:
        log.warning("correction LLM call failed: %s", exc)

    recheck: Optional[Claim] = None
    if corrected:
        try:
            recheck = await audit_single_claim_fn(corrected, source_ids)
        except Exception as exc:
            log.warning("correction re-audit failed: %s", exc)

    return CorrectionResponse(
        claim_id=claim.claim_id,
        original=claim.text,
        corrected=corrected,
        evidence=claim.evidence,
        recheck=recheck,
    )
