"""Answer-level reasoning & safety checks (P2).

Two separate LLM calls over the full answer + claim verdicts:
  1. Reasoning: does any conclusion not follow from the supported claims?
  2. Safety:    does the answer give risky advice even if supported?

Each produces a list of Finding objects with exact span_text located by
locate_span (never by the LLM).
"""
from __future__ import annotations

import logging
from typing import List

from pydantic import BaseModel

from app.models import Claim, Finding, AnswerSpan
from app.validation.spans import locate_span

log = logging.getLogger(__name__)


class _LLMFinding(BaseModel):
    span_text: str
    severity: str
    explanation: str


async def run_answer_checks(
    answer_text: str,
    claims: List[Claim],
    genai_client,  # google.genai.Client
    model: str,
) -> List[Finding]:
    """Run reasoning + safety checks and return Finding list."""
    findings: List[Finding] = []
    try:
        findings += await _check(answer_text, claims, genai_client, model, "reasoning")
        findings += await _check(answer_text, claims, genai_client, model, "safety")
    except Exception as exc:
        log.warning("answer_checks failed: %s", exc)
    return findings


async def _check(
    answer_text: str,
    claims: List[Claim],
    client,
    model: str,
    check_type: str,
) -> List[Finding]:
    import asyncio

    verdicts_summary = "\n".join(
        f"- [{c.verdict}] {c.text}" for c in claims if c.verdict
    )

    if check_type == "reasoning":
        instruction = (
            "You are a logic auditor. The answer below has been fact-checked claim by claim. "
            "Identify any sentence or phrase where the answer draws a conclusion that does NOT "
            "logically follow from the supported claims. Ignore claims already marked contradicted "
            "or unsupported — focus only on reasoning gaps.\n"
            "Return JSON: [{\"span_text\": \"exact substring from answer\", "
            "\"severity\": \"low|medium|high\", \"explanation\": \"one sentence\"}]\n"
            "If no reasoning problems, return []."
        )
    else:
        instruction = (
            "You are a safety auditor. The answer below may give advice in a medical, legal, "
            "or financial domain. Identify any sentence where the advice could cause harm even "
            "if the facts are accurate.\n"
            "Return JSON: [{\"span_text\": \"exact substring from answer\", "
            "\"severity\": \"low|medium|high\", \"explanation\": \"one sentence\"}]\n"
            "If no safety concerns, return []."
        )

    prompt = (
        f"{instruction}\n\n"
        f"<answer>\n{answer_text}\n</answer>\n\n"
        f"Claim verdicts:\n{verdicts_summary}"
    )

    from pydantic import RootModel

    class FindingList(RootModel):
        root: List[_LLMFinding]

    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": FindingList,
                "temperature": 0,
            },
        )
        raw_findings: List[_LLMFinding] = response.parsed.root
    except Exception as exc:
        log.warning("answer_checks LLM call failed (%s): %s", check_type, exc)
        return []

    findings: List[Finding] = []
    for rf in raw_findings:
        loc = locate_span(answer_text, rf.span_text)
        if loc is None:
            log.debug("answer_check span not located: %r", rf.span_text)
            continue
        severity = rf.severity if rf.severity in ("low", "medium", "high") else "low"
        findings.append(Finding(
            type=check_type,  # type: ignore[arg-type]
            answer_span=AnswerSpan(start=loc[0], end=loc[1]),
            severity=severity,  # type: ignore[arg-type]
            explanation=rf.explanation,
        ))
    return findings
