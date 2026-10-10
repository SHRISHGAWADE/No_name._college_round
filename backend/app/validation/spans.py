"""Answer-span location (P2).

Contract: offsets are **Unicode code-point** indices (Python str indexing).
The LLM is never trusted for offsets; this code does the work.

Strategy (in order):
  1. Exact substring match.
  2. Whitespace-normalised match with an index map back to the original.
  3. rapidfuzz fuzzy match with a high threshold (≥ 92).
     Fuzzy is allowed here — a slightly shifted highlight is harmless.

Returns (start, end) code-point indices or None.
"""
from __future__ import annotations

import re
from typing import Optional, Tuple

from rapidfuzz import fuzz, process as rfprocess


def locate_span(answer_text: str, span_text: str) -> Optional[Tuple[int, int]]:
    """Return (start, end) code-point offsets of span_text in answer_text, or None."""
    if not span_text or not answer_text:
        return None

    # ── 1. Exact ──────────────────────────────────────────────────────────
    idx = answer_text.find(span_text)
    if idx != -1:
        return (idx, idx + len(span_text))

    # ── 2. Strip, then exact ───────────────────────────────────────────────
    stripped = span_text.strip()
    if stripped:
        idx = answer_text.find(stripped)
        if idx != -1:
            return (idx, idx + len(stripped))

    # ── 3. Whitespace-normalised with index map ────────────────────────────
    # Build a map from collapsed-position → original code-point position.
    result = _ws_normalised_find(answer_text, stripped)
    if result:
        return result

    # ── 4. rapidfuzz best-match window (fuzzy, allowed for spans) ─────────
    # Slide a window of ±20 chars around likely matches.
    window = len(stripped) + 20
    best_score = 0.0
    best_pos: Optional[Tuple[int, int]] = None
    for start in range(0, len(answer_text), max(1, len(stripped) // 2)):
        candidate = answer_text[start : start + window]
        score = fuzz.partial_ratio(stripped, candidate)
        if score > best_score:
            best_score = score
            best_pos = (start, min(start + len(stripped), len(answer_text)))

    if best_score >= 92 and best_pos:
        return best_pos

    return None


def _ws_normalised_find(original: str, query: str) -> Optional[Tuple[int, int]]:
    """Find query in original after collapsing whitespace, map back to original offsets."""
    if not query:
        return None

    # Build index map: collapsed_pos → original_pos
    # We iterate code points.
    collapsed: list[str] = []
    index_map: list[int] = []
    in_ws = False
    for i, ch in enumerate(original):
        if re.match(r"\s", ch):
            if not in_ws:
                collapsed.append(" ")
                index_map.append(i)
                in_ws = True
        else:
            collapsed.append(ch)
            index_map.append(i)
            in_ws = False

    collapsed_str = "".join(collapsed)
    norm_query = re.sub(r"\s+", " ", query).strip()

    cidx = collapsed_str.find(norm_query)
    if cidx == -1:
        return None

    orig_start = index_map[cidx]
    end_collapsed = cidx + len(norm_query)
    if end_collapsed <= len(index_map):
        orig_end = index_map[end_collapsed - 1] + 1
    else:
        orig_end = len(original)

    return (orig_start, orig_end)
