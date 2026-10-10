# P2: Backend Verification and Features

You own: `backend/app/validation/`, `features/`, `routes/sources.py`, `Dockerfile`, backend deployment.
This is the trust layer: it is what makes us better than "ask another AI". Your functions are used by P1 in every audit, so deliver the signatures in hour 1 (stubs first).

## Function signatures (agree with P1 in hour 1)
```python
# validation/text.py
def normalize_text(s: str) -> str                      # NFC, \r\n -> \n. Applied once at upload/submit.
# validation/spans.py
def locate_span(answer_text: str, span_text: str) -> tuple[int, int] | None
# validation/quotes.py
def verify_quote(quote: str, pages: list[Page]) -> QuoteMatch | None   # QuoteMatch: page, start, end
# sources/extract.py
def extract_pages(filename: str, data: bytes) -> list[Page]            # Page: page:int, text:str
```

## Hour 0-2
- [ ] `POST /api/sources` (multipart + JSON text). Stores `Source` objects in an in-memory dict; returns the contract shape.
- [ ] PDF extraction with PyMuPDF (`fitz.open(stream=data, filetype="pdf")`, `page.get_text()`), one `Page` per PDF page, normalized text. TXT becomes a single page.
- [ ] If total extracted text is under about 50 characters: return 422 `no_text_layer` (scanned PDF; OCR is out of scope).
- [ ] Backend `Dockerfile` + `requirements.txt` + `.env.example`; deploy with P1.

## Hour 2-6: validators (most important work you do)
**`locate_span`**: exact match first; then whitespace-normalized match with an index map back to the original; then a fuzzy fallback (`rapidfuzz`) with a high threshold. Returns `None` if not found. Fuzzy is allowed here because a slightly misplaced highlight is harmless.

**`verify_quote`**: **exact match only after normalization** (collapse whitespace and line breaks, lowercase, normalize quotes/dashes/ligatures, de-hyphenate PDF line breaks). Map the match back to original offsets in the page text.
- **No fuzzy matching for quotes, ever.** "30 days" vs "60 days" is a one-character difference, and a fuzzy matcher would accept a fabricated quote.
- Search all pages; return the page and offsets.

Unit tests (these are your safety net):
- Quote with different line breaks/whitespace passes.
- Quote with one changed digit fails.
- Quote that spans two pages fails (documented limitation).
- Span with emoji/curly quotes returns correct code point offsets.
- Golden example: all 4 evidence quotes verify with the offsets in `mock/audit.json`.

## Hour 6-12: features
**Confidence combiner** (`features/confidence.py`), heuristic, tuned later with eval data:
```
score = 0.4*quote_verified + 0.3*agreement_ratio + 0.3*retrieval_score_normalized
label = high if score >= 0.75; medium if >= 0.5; else low
```
For `unsupported` with no evidence, base confidence on retrieval (low relevant retrieval means more confident that the source is silent). Fill `signals`. Never present it as a probability.

**Answer-level checks** (`features/answer_checks.py`), two separate LLM calls over the answer + claim verdicts:
- *Reasoning:* does any conclusion not follow from the supported claims? Return `Finding`s with an exact `span_text` (locate it with your own `locate_span`).
- *Safety:* does the answer give risky advice (medical dosage, legal, financial) even if supported? Same output shape.

**Correct & re-audit** (`features/correction.py` + route):
1. Input: `audit_id`, `claim_id`. Take the claim and its verified evidence.
2. LLM prompt: "Rewrite the claim so it is fully supported by the evidence quote. Use only information in the quote. If the evidence cannot fix it, say so."
3. Call P1's `audit_single_claim(corrected_text, source_ids)` and return it as `recheck`.
4. Unsupported claims (no evidence): `corrected: null`.

## Hour 12+
- Optional signals only if CP3 is green and P4's eval shows a need: HHEM (`transformers`, needs torch; too heavy for small hosts, so keep it local/flagged) and Jev (via Vercel AI Gateway or TypeSafe's API). Behind `ENABLE_HHEM` / `ENABLE_JEV` env flags. Compare against the baseline in the eval before claiming anything.
- Harden: huge PDFs (cap pages/size), unreadable files, empty text, concurrent uploads.

## Definition of done
All validator tests pass; golden quotes verify; correction on golden claim 1 produces "30 days" and re-audits as `supported`; the deployed backend survives a hostile input list (see P4's hardening checklist).

## Instructions for your coding assistant
- Quote verification is exact-after-normalization. Do not add fuzzy matching to `verify_quote`.
- Offsets are Unicode code point indices (Python `str` indices). Write tests with non-ASCII and emoji.
- Pure functions, fully typed, one test per edge case above.
- Do not change contract field names. If something is missing, ask P1/P3.

---
# v1.1 additions
- **Limits** (env-configurable): `MAX_FILE_MB` default 10 (413 `file_too_large`), 50 pages (422 `too_many_pages`), answer about 20,000 chars (422 `answer_too_long`), max 5 files. Per-IP rate limit with `slowapi` (429 `rate_limited`, friendly message). `RATE_LIMIT_DISABLED=1` must exist so judges are never blocked on demo day.
- **Privacy:** a background task deletes sources and audits older than `RETENTION_MIN` (default 60). Never log answer or source text: log IDs, sizes, and timings only.
- **Structured JSON logs** with a request ID middleware (`X-Request-ID`, generated if missing, echoed in the response).
- **Deploy flag:** Cloud Run `--max-instances 1` while state is in memory.
