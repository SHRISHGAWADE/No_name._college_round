"""Pydantic models that exactly match API Contract v1.1.

Field names, types, and literals are authoritative.  Any change here
requires a version bump and team announcement (contract rule).
"""
from __future__ import annotations

from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field


# ── Source / upload ────────────────────────────────────────────────────────

class Page(BaseModel):
    page: int
    text: str


class Source(BaseModel):
    source_id: str
    name: str
    pages: List[Page]


class SourcesResponse(BaseModel):
    sources: List[Source]


# ── Claim sub-objects ──────────────────────────────────────────────────────

class AnswerSpan(BaseModel):
    start: int
    end: int


class Evidence(BaseModel):
    source_id: str
    source_name: str
    page: int
    quote: str
    start: int
    end: int
    quote_verified: bool = True


class Signals(BaseModel):
    quote_verified: Optional[bool] = None
    retrieval_score: Optional[float] = None
    agreement: Optional[str] = None
    jev: Optional[Any] = None
    hhem: Optional[Any] = None


# ── Claim ─────────────────────────────────────────────────────────────────

VerdictLiteral = Optional[Literal["supported", "contradicted", "unsupported", "ambiguous"]]
ErrorTypeLiteral = Optional[Literal[
    "wrong_number", "contradiction", "fabricated_fact",
    "unsupported_addition", "logical_leap", "unsafe_advice",
]]
ConfidenceLabelLiteral = Literal["high", "medium", "low"]


class Claim(BaseModel):
    claim_id: str
    text: str
    answer_span: Optional[AnswerSpan] = None
    status: Literal["pending", "done", "error"] = "pending"
    verdict: VerdictLiteral = None
    error_type: ErrorTypeLiteral = None
    flags: List[str] = Field(default_factory=list)
    confidence: float = 0.0
    confidence_label: ConfidenceLabelLiteral = "low"
    explanation: str = ""
    evidence: List[Evidence] = Field(default_factory=list)
    signals: Optional[Signals] = None


# ── Finding ───────────────────────────────────────────────────────────────

class Finding(BaseModel):
    type: Literal["reasoning", "safety"]
    answer_span: AnswerSpan
    severity: Literal["low", "medium", "high"]
    explanation: str


# ── Summary ───────────────────────────────────────────────────────────────

class SummaryCounts(BaseModel):
    supported: int = 0
    contradicted: int = 0
    unsupported: int = 0
    ambiguous: int = 0


class Summary(BaseModel):
    label: Literal["reliable", "partially_supported", "contains_errors"]
    counts: SummaryCounts
    supported_ratio: float


# ── Trace ─────────────────────────────────────────────────────────────────

class TraceStage(BaseModel):
    name: str
    ms: int


class Trace(BaseModel):
    model: str
    total_ms: int
    stages: List[TraceStage]


# ── AuditResult ───────────────────────────────────────────────────────────

class AuditResult(BaseModel):
    audit_id: str
    status: Literal["running", "done", "error"]
    created_at: str
    answer_text: str
    source_ids: List[str]
    claims: List[Claim] = Field(default_factory=list)
    answer_findings: List[Finding] = Field(default_factory=list)
    summary: Optional[Summary] = None
    trace: Optional[Trace] = None


# ── Request / response shapes ─────────────────────────────────────────────

class AuditCreateRequest(BaseModel):
    answer: str
    source_ids: List[str] = Field(min_length=1)


class AuditCreateResponse(BaseModel):
    audit_id: str


class CorrectionResponse(BaseModel):
    claim_id: str
    original: str
    corrected: Optional[str] = None
    evidence: List[Evidence] = Field(default_factory=list)
    recheck: Optional[Claim] = None


# ── Error envelope ────────────────────────────────────────────────────────

class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


# ── Summary helper ────────────────────────────────────────────────────────

def compute_summary(claims: List[Claim]) -> Summary:
    """Compute Summary from a finished claim list using the contract rule."""
    counts = SummaryCounts()
    for c in claims:
        if c.verdict == "supported":
            counts.supported += 1
        elif c.verdict == "contradicted":
            counts.contradicted += 1
        elif c.verdict == "unsupported":
            counts.unsupported += 1
        elif c.verdict == "ambiguous":
            counts.ambiguous += 1

    total = len(claims)
    ratio = round(counts.supported / total, 4) if total else 0.0

    if counts.contradicted > 0:
        label: Literal["reliable", "partially_supported", "contains_errors"] = "contains_errors"
    elif counts.unsupported > 0 or counts.ambiguous > 0 or any(c.status != "done" for c in claims):
        label = "partially_supported"
    else:
        label = "reliable"

    return Summary(label=label, counts=counts, supported_ratio=ratio)
