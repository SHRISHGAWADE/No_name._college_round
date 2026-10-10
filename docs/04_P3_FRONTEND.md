# P3: Frontend

You own: everything in `frontend/`. Judges score presentation, and the frontend IS the presentation. You also own the Vercel deployment.

## Stack
Next.js (App Router) + TypeScript + Tailwind + shadcn/ui. Create with:
```
npx create-next-app@latest frontend --ts --tailwind --app
cd frontend && npx shadcn@latest init
```
Validate every API response with `zod` (`src/lib/schema.ts` mirrors `01_API_CONTRACT.md`).

## Hour 0-2: walking skeleton (blocks everyone)
- [ ] Create the app; copy `mock/audit.json` and `mock/sources.json` into `frontend/public/mock/`.
- [ ] `NEXT_PUBLIC_USE_MOCK=1` loads the mock files and simulates streaming with timers (claims pending, then resolved one by one every ~700 ms). You never wait for the backend.
- [ ] Render the golden answer with highlighted claims (see highlighter rules below).
- [ ] **Deploy to Vercel now.** Import the GitHub repo, set **Root Directory = `frontend`**, set `NEXT_PUBLIC_API_BASE`. Every PR gets a preview URL automatically; `main` is the demo URL. Announce it.
- [ ] CP1: call the deployed backend's `/health` and `/api/mock/audit` from the deployed frontend.

## Screens and components
**Home (`/`)**
- Textarea for the AI answer; dropzone for PDF/TXT sources (also a "paste source text" option).
- **"Load demo example"** button fills the golden answer + source in one click (essential for the demo).
- **Audit** button, disabled until both inputs exist. Progress state while uploading.

**Audit view (`/audit/[id]`)**
- `SummaryBar` on top: overall label, counts per verdict, legend.
- Left: `AnswerHighlighter`. Right: `EvidenceInspector`. Below or beside: `ClaimList` with filter chips (verdict, error type).
- `FindingsBanner` for reasoning/safety findings.

**`AnswerHighlighter` rules**
- Render from `answer_text`; split with `Array.from(answer_text)` because offsets are code points.
- Sort claims by `answer_span.start`. If spans overlap, the higher severity wins (contradicted > unsupported > ambiguous > supported); never crash on overlap or null spans.
- Pending claims: shimmer. Click a span to select the claim.
- Color plus icon plus label for each verdict (color alone is not accessible): supported (green check), contradicted (red x), unsupported (orange question), ambiguous (yellow wave).

**`EvidenceInspector`**
- Verdict badge, error type, explanation, `confidence_label` (signals in a tooltip), flags (e.g. "evidence could not be verified").
- Evidence card: source name, page, the quote. **"View in source"** opens `SourceViewer` showing that page's text with the quote highlighted (code point slicing again).
- For `contradicted`/`unsupported`: **Correct & re-audit** button calls the correction endpoint and shows original, corrected sentence, and a green "Re-verified: supported" badge (or a warning if the recheck fails).

**Report (`/report/[id]`)**
- Clean, print-friendly layout (`@media print`): summary, annotated answer, claim table with evidence, findings, methodology note ("verdicts are relative to the uploaded sources").
- **Download PDF** button calls `window.print()`. No server-side PDF needed.

## Data flow (`src/lib/useAudit.ts`)
1. `POST /api/sources`, then `POST /api/audit` to get `audit_id`.
2. Open `EventSource` on `/stream`. Handle `claims`, `claim`, `findings`, `done`, `error`.
3. If the stream errors or never delivers within 5 s, fall back to polling `GET /api/audit/{id}` every 1 s.

## States you must handle (judges will hit these)
- Backend asleep (free tiers): "Waking up the server..." with automatic retry.
- Scanned PDF (422 `no_text_layer`): clear message.
- Empty inputs, very long answers (show the claim cap notice), rate-limit errors, network loss.
- Claims with `status: error`: show "could not verify" instead of breaking the page.

## Visual polish (cheap and high impact)
One consistent palette, generous spacing, readable type; highlight transitions as results arrive; skeleton loaders; a clear one-line explanation on the home screen; sample-answer chips; dark/light follows system. First screen must be self-explanatory to someone who has never heard of the project.

## Definition of done
Whole demo flow works on the Vercel URL against the real backend, mobile layout does not break (judges may view on a phone), and the page never shows a raw error or blank screen.

## Instructions for your coding assistant
- Follow `01_API_CONTRACT.md` exactly; validate responses with zod.
- Offsets are Unicode code points: always slice via `Array.from`, never `string.slice`.
- Never put API keys in the frontend. Only `NEXT_PUBLIC_API_BASE` and `NEXT_PUBLIC_USE_MOCK` are public.
- Build against the mock first. Do not wait for the backend.
- Components small and typed; no `any`.

---
# v1.1 additions
- **"How this was checked" drawer:** renders `trace` (stage bars with milliseconds, model name) and a legend for the `signals`. Hide it when `trace` is null.
- **Friendly messages** for the new error codes: `file_too_large`, `too_many_pages`, `answer_too_long`, `no_text_layer`, `rate_limited`. Show the request ID in a small "copy details" link on errors.
