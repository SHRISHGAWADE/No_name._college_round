"""PDF / TXT extraction and chunking (P2 owns extract_pages; P1 owns chunking).

extract_pages: Called by /api/sources route.
chunk_source:  Called by retrieval pipeline.
"""
from __future__ import annotations

import logging
import re
from typing import List

from app.models import Page

log = logging.getLogger(__name__)


# ── PDF / TXT extraction (P2) ─────────────────────────────────────────────

def extract_pages(filename: str, data: bytes) -> List[Page]:
    """Extract pages from a PDF or text file.

    Returns a list of Page objects with normalised text.
    Raises ValueError for scanned PDFs (no text layer).
    """
    from app.validation.text import normalize_text

    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    if ext == "pdf":
        try:
            import fitz  # PyMuPDF
        except ImportError as exc:
            raise RuntimeError("PyMuPDF is not installed") from exc

        doc = fitz.open(stream=data, filetype="pdf")
        pages: List[Page] = []
        total_text = 0

        for i, page in enumerate(doc, start=1):
            text = normalize_text(page.get_text())
            total_text += len(text.strip())
            pages.append(Page(page=i, text=text))

        doc.close()

        if total_text < 50:
            raise ValueError("no_text_layer")

        return pages
    else:
        # Plain text / TXT
        text = normalize_text(data.decode("utf-8", errors="replace"))
        return [Page(page=1, text=text)]


# ── Sentence-aware chunking (P1) ──────────────────────────────────────────

def chunk_source(pages: List[Page], chunk_words: int = 200, overlap_frac: float = 0.20) -> List[dict]:
    """Split source pages into overlapping word chunks for retrieval.

    Each chunk carries: source_id (caller injects), page, char_start, text.
    """
    # We build chunks per page to preserve page provenance.
    chunks: List[dict] = []
    overlap_words = max(1, int(chunk_words * overlap_frac))

    for p in pages:
        # Split into sentences using simple regex
        sentences: List[str] = re.split(r"(?<=[.!?])\s+", p.text.strip())
        # Flatten to words with sentence boundaries preserved
        words: List[str] = []
        for sent in sentences:
            words.extend(sent.split())

        step = chunk_words - overlap_words
        if step <= 0:
            step = chunk_words

        for start_w in range(0, max(1, len(words)), step):
            chunk_words_list = words[start_w : start_w + chunk_words]
            if not chunk_words_list:
                break
            chunk_text = " ".join(chunk_words_list)
            # Approximate char_start from the original page text
            char_start = p.text.find(chunk_words_list[0]) if chunk_words_list else 0

            chunks.append({
                "page": p.page,
                "char_start": max(char_start, 0),
                "text": chunk_text,
            })

    return chunks
