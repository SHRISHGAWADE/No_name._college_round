"""Evidence quote verification (P2) — the trust anchor of the whole system.

Contract rule (non-negotiable): **exact match only after normalisation**.
NO fuzzy matching ever.  "30 days" vs "60 days" is one digit — a fuzzy
matcher would accept a fabricated quote and defeat the whole purpose.

Normalisation applied before matching:
  • Collapse whitespace (spaces, newlines, PDF line-break hyphens).
  • Lowercase.
  • Normalise typographic punctuation (curly quotes → straight, em dash → -).
  • De-hyphenate soft PDF hyphens (U+00AD).

The raw source offset in `QuoteMatch` indexes the *original* page text
(code-point indices, Python str indexing), consistent with the contract.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import List, Optional

from app.models import Page


@dataclass
class QuoteMatch:
    page: int
    start: int   # code-point offset in original page.text
    end: int     # exclusive


# Characters to normalise before comparison
_TYPOGRAPHIC = str.maketrans({
    "\u2018": "'",  # left single quotation mark
    "\u2019": "'",  # right single quotation mark
    "\u201c": '"',  # left double quotation mark
    "\u201d": '"',  # right double quotation mark
    "\u2013": "-",  # en dash
    "\u2014": "-",  # em dash
    "\u00ad": "",   # soft hyphen (PDF line-break artifact)
})


def _normalise_for_verify(s: str) -> str:
    """Apply deterministic normalisation for quote verification.

    Steps (order matters):
    1. NFC
    2. Remove soft hyphens / typographic punct
    3. Lowercase
    4. Collapse all whitespace (including \\n from PDF) to single space
    5. Strip
    """
    s = unicodedata.normalize("NFC", s)
    s = s.translate(_TYPOGRAPHIC)
    s = s.lower()
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def verify_quote(quote: str, pages: List[Page]) -> Optional[QuoteMatch]:
    """Return QuoteMatch if quote exists verbatim (after normalisation) in pages.

    Searches all pages; returns the first match.
    Returns None if the quote is empty, or if no normalised match is found.
    """
    if not quote or not quote.strip():
        return None

    norm_quote = _normalise_for_verify(quote)
    if not norm_quote:
        return None

    for p in pages:
        norm_page = _normalise_for_verify(p.text)
        idx = norm_page.find(norm_quote)
        if idx == -1:
            continue

        # Map collapsed idx back to original code-point offset.
        # We rebuild the mapping character by character.
        orig_start, orig_end = _map_back(p.text, norm_quote, idx)
        return QuoteMatch(page=p.page, start=orig_start, end=orig_end)

    return None


def _map_back(original: str, norm_query: str, norm_idx: int) -> tuple[int, int]:
    """Map a position in the normalised string back to original code-point offsets.

    We walk `original` applying the same normalisation steps character by
    character and build an index map.
    """
    # Build parallel (orig_pos, norm_chars) list
    norm_chars: list[str] = []
    orig_map: list[int] = []   # orig_map[i] = original code-point index

    i = 0
    chars = list(original)   # code-point iteration
    in_ws = False

    for orig_idx, ch in enumerate(chars):
        # soft hyphen → skip
        if ch == "\u00ad":
            continue
        # typographic → straight
        ch = ch.translate(_TYPOGRAPHIC)
        # lowercase
        ch_l = ch.lower()
        # whitespace collapse
        if re.match(r"\s", ch_l):
            if not in_ws:
                norm_chars.append(" ")
                orig_map.append(orig_idx)
                in_ws = True
        else:
            for nc in ch_l:
                norm_chars.append(nc)
                orig_map.append(orig_idx)
            in_ws = False

    # Find the start in our norm_chars list
    # norm_idx already found via str.find on the joined norm_chars
    # We need to locate it in our list
    norm_joined = "".join(norm_chars)
    # Verify consistency (should always match since it's the same algorithm)
    found = norm_joined.find(norm_query, norm_idx)
    if found == -1:
        found = norm_joined.find(norm_query)
    if found == -1:
        # Fallback: estimate
        return (0, len(original))

    start_orig = orig_map[found] if found < len(orig_map) else 0
    end_norm = found + len(norm_query)
    if end_norm > 0 and end_norm <= len(orig_map):
        end_orig = orig_map[end_norm - 1] + 1
    else:
        end_orig = len(original)

    return (start_orig, end_orig)
