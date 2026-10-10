"""Confidence score combiner (P2).

Heuristic — not a calibrated probability.  The UI shows the label, not
a raw percentage.  The formula will be tuned against the eval set.

  score = 0.4 * quote_verified
        + 0.3 * agreement_ratio
        + 0.3 * retrieval_score_normalised
  label = high ≥ 0.75 | medium ≥ 0.50 | else low

For unsupported claims with no evidence, a low retrieval score is
*evidence of silence* (more confident the source is silent).
"""
from __future__ import annotations

from typing import Literal, Tuple


ConfidenceLabelT = Literal["high", "medium", "low"]


def compute_confidence(
    quote_verified: bool,
    agreement_ratio: float = 1.0,   # e.g. 3/3 → 1.0, 2/3 → 0.667
    retrieval_score: float = 0.5,
    verdict: str | None = None,
) -> Tuple[float, ConfidenceLabelT]:
    """Return (score ∈ [0,1], label)."""
    qv = 1.0 if quote_verified else 0.0

    # For unsupported with no evidence, invert retrieval contribution
    if verdict == "unsupported" and not quote_verified:
        # low retrieval → more confident the source is silent
        retrieval_contribution = 1.0 - min(max(retrieval_score, 0.0), 1.0)
    else:
        retrieval_contribution = min(max(retrieval_score, 0.0), 1.0)

    score = round(
        0.4 * qv
        + 0.3 * min(max(agreement_ratio, 0.0), 1.0)
        + 0.3 * retrieval_contribution,
        4,
    )

    if score >= 0.75:
        label: ConfidenceLabelT = "high"
    elif score >= 0.50:
        label = "medium"
    else:
        label = "low"

    return score, label
