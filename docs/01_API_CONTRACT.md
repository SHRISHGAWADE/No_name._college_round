# API Contract (v1.2): single source of truth

P1 implements it (Pydantic models in `backend/app/models.py`). P3 mirrors it (TypeScript types + zod in `frontend/src/lib/schema.ts`). Changes need version bump + team announcement.

Ready-made examples: `mock/audit.json` and `mock/sources.json` (the golden refund-policy example). Use them as the frontend mock and as backend test fixtures.

## Conventions
- JSON, UTF-8. IDs are strings.
- **All offsets are Unicode code point indices** (Python `str` indexing), start inclusive, end exclusive.
- In JavaScript, never use `.slice` / `.length` for offsets. Use `Array.from(text)` (code points) or helper functions.
- `answer_span` indexes into `answer_text` as returned by the backend (normalized: NFC, `\r\n` to `\n`). The frontend renders from `answer_text`, not from what the user typed.
- Evidence `start`/`end` index into the `text` of that source page as returned by `POST /api/sources`. The frontend keeps that response in state.
- Errors: `{"error": {"code": "string", "message": "human readable"}}` with a proper HTTP status.

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{"ok": true, "version": "1.1"}` |
| POST | `/api/sources` | Upload sources. `multipart/form-data` with `files[]` (PDF/TXT), or JSON `{"name": "...", "text": "..."}` for pasted text. Returns `{"sources":[Source]}` |
| POST | `/api/audit` | Body `{"answer": "...", "source_ids": ["s1"]}`. Returns `{"audit_id": "a_123"}` immediately; work runs in background |
| GET | `/api/audit/{audit_id}` | Current `AuditResult`. Works while running (partial) and when done. **Polling fallback** |
| GET | `/api/audits` | Signed-in user's recent audit summaries, newest first |
| GET | `/api/audit/{audit_id}/stream` | Server-Sent Events (below) |
| POST | `/api/audit/{audit_id}/claims/{claim_id}/correct` | Evidence-grounded correction + re-audit |
| GET | `/api/sources` | Signed-in user's saved source library |
| GET | `/api/sources/{source_id}` | Extracted source pages, ownership checked |
| GET | `/api/sources/{source_id}/file-url` | Five-minute signed URL for the private original PDF |
| GET | `/api/mock/sources`, `/api/mock/audit` | Canned JSON from `mock/` |
| env `MOCK=1` | | The real routes return canned data with artificial delays (for frontend work against a deployed backend) |

## Authentication and persistence

When Supabase is configured on the backend, user-facing endpoints require `Authorization: Bearer <Supabase access token>`. The API validates the token with Supabase Auth and scopes audits, sources, PDF access, and cached embeddings to the authenticated user. The frontend uses Supabase email/password auth. In local mode without Supabase environment variables, the API uses the ephemeral `local-user` store for development.

The backend stores audit results and extracted pages in Postgres, original PDFs in a private Storage bucket, and document chunk embeddings in `source_chunks`. Only the backend service-role key accesses these resources; never expose it to the browser. Run `backend/supabase/migrations/001_history_and_sources.sql` before enabling persistence.

## Source
```json
{"source_id": "s1", "name": "refund_policy.pdf",
 "pages": [{"page": 1, "text": "..."}, {"page": 2, "text": "..."}]}
```
TXT/pasted text becomes a single page `1`. A PDF with no text layer returns 422 `no_text_layer`.

## AuditResult
```json
{
  "audit_id": "a_123",
  "status": "running | done | error",
  "created_at": "ISO-8601",
  "answer_text": "normalized answer",
  "source_ids": ["s1"],
  "claims": [ Claim ],
  "answer_findings": [ Finding ],
  "summary": Summary | null,
  "trace": Trace | null,
  "error": "short, safe error message | null"
}
```

## Claim
```json
{
  "claim_id": "c1",
  "text": "standalone restatement of the claim",
  "answer_span": {"start": 0, "end": 60},
  "status": "pending | done | error",
  "verdict": "supported | contradicted | unsupported | ambiguous | null",
  "error_type": "wrong_number | contradiction | fabricated_fact | unsupported_addition | logical_leap | unsafe_advice | null",
  "flags": ["evidence_unverified", "span_not_located", "reasoning", "unsafe", "low_retrieval"],
  "confidence": 0.93,
  "confidence_label": "high | medium | low",
  "explanation": "one or two sentences",
  "evidence": [ Evidence ],
  "signals": {"quote_verified": true, "retrieval_score": 0.84, "agreement": "3/3", "jev": null, "hhem": null}
}
```
While `status` is `pending`, `verdict` is `null` and the UI shows a shimmer on that span.

**Verdict definitions (use these exact meanings everywhere, including prompts and the evaluation set):**
- `supported`: a source passage states or directly implies the claim.
- `contradicted`: a source passage states something incompatible with the claim.
- `unsupported`: the sources do not establish the claim. Silence is not falsehood.
- `ambiguous`: sources conflict, or the claim is too vague to judge.

**Confidence is heuristic, not a probability.** The UI shows `confidence_label` (and the signals on hover), never "93% likely correct", unless calibrated against our eval set.

## Evidence
```json
{"source_id": "s1", "source_name": "refund_policy.pdf", "page": 1,
 "quote": "exact text copied from the source",
 "start": 15, "end": 76, "quote_verified": true}
```
Evidence is only returned if `quote_verified` is true. Unverifiable quotes are dropped (the claim gets the flag `evidence_unverified`).

## Finding (answer-level reasoning / safety)
```json
{"type": "reasoning | safety", "answer_span": {"start": 10, "end": 90},
 "severity": "low | medium | high", "explanation": "..."}
```

## Summary
```json
{"label": "reliable | partially_supported | contains_errors",
 "counts": {"supported": 2, "contradicted": 2, "unsupported": 1, "ambiguous": 0},
 "supported_ratio": 0.4}
```
Rule: any `contradicted` gives `contains_errors`; else any `unsupported`/`ambiguous` gives `partially_supported`; else `reliable`.

## SSE events (`/api/audit/{id}/stream`)
| Event | Data |
|---|---|
| `claims` | `{"claims": [Claim with status "pending"]}`, sent once after extraction |
| `claim` | one completed `Claim` (replace the pending one by `claim_id`) |
| `findings` | `{"answer_findings": [Finding]}` |
| `done` | `{"summary": Summary}` |
| `error` | `{"error": {...}}` |

Test streaming on the deployed host at CP1. Some proxies buffer SSE. If it does not stream, the frontend polls `GET /api/audit/{id}` every 1 s instead.

## Correction
`POST /api/audit/{audit_id}/claims/{claim_id}/correct` returns:
```json
{"claim_id": "c1",
 "original": "Refund requests can be submitted within 60 days of purchase.",
 "corrected": "Refund requests must be submitted within 30 days of purchase.",
 "evidence": [Evidence],
 "recheck": Claim}
```
`corrected` may be `null` for unsupported claims (suggestion: remove it or verify externally). `recheck` is a fresh audit of the corrected sentence and must come back `supported` for the UI to show the green "verified" badge.

## Golden example (regression test for everyone)
Files: `data/golden_answer.txt`, `data/golden_source.txt` (one-page TXT), `data/golden_source_page1.txt` + `page2.txt` (make a 2-page PDF to test page tracking), `data/golden_expected.json`.

Expected verdicts in answer order: **1 contradicted** (60 vs 30 days), **2 supported**, **3 contradicted** (digital products non-refundable once downloaded), **4 supported**, **5 unsupported** (free replacement not mentioned in the source).

## Trace (v1.1, optional, nullable)
Timing of each pipeline stage, shown in the "How this was checked" drawer.
```json
{"model": "model name used", "total_ms": 8442,
 "stages": [{"name": "extract_claims", "ms": 820}, {"name": "retrieve", "ms": 310},
            {"name": "verdicts", "ms": 5400}, {"name": "validate", "ms": 12}, {"name": "answer_checks", "ms": 1900}]}
```

## Limits and error codes (v1.1)
| HTTP | code | When |
|---|---|---|
| 413 | `file_too_large` | file above `MAX_FILE_MB` (default 10) |
| 422 | `too_many_pages` | more than 50 pages |
| 422 | `answer_too_long` | answer above about 20,000 characters |
| 422 | `no_text_layer` | scanned PDF |
| 429 | `rate_limited` | per-IP limit hit; `message` must be human friendly |

Every response carries an `X-Request-ID` header (the backend generates one if the client sends none). Include it in bug reports.
