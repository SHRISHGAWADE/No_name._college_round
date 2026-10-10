# Frontend Page Inventory and Screen Spec

This file supplements `04_P3_FRONTEND.md`. The API shapes and behavior in `01_API_CONTRACT.md` remain authoritative. Build the required audit journey first; do not create navigation destinations that have no working feature behind them.

## Page inventory

| Screen | Route | Priority | What it does |
|---|---|---|---|
| Home / New audit | `/` | Required | Collect an AI-generated answer and its source documents, then start an audit. |
| Audit review | `/audit/[id]` | Required | Show the answer, claim verdicts, verified evidence, findings, and progress. |
| Audit report | `/report/[id]` | Required | Present a clean, printable summary of a completed audit. |
| Source viewer | No separate route; drawer or modal from Audit review | Required | Show a cited source page and highlight the exact verified quote. |
| Recent audits | `/history` | Later, only if audit listing is supported | Let a user reopen recent audits. Do not imply durable history while audit state is in-memory. |
| Source library | `/sources` | Later, only if source storage/listing is supported | Browse reusable uploaded sources. The current contract has no source-list endpoint. |
| Saved reports | `/saved` | Later | Show explicitly saved reports. Do not show a bookmark destination until save behavior exists. |
| Activity | `/activity` | Later | Show meaningful audit events only if the product has a defined event source. |
| Settings | `/settings` | Later | Only add settings that the unauthenticated product actually supports. |

For the first demo, implement the first four rows. The remaining rows are not required pages for the first release. A clock, bookmark, database, activity, or settings icon in the sidebar implies a working destination; hide it until that destination is implemented. Do not link every icon to `/` or use decorative controls that appear interactive but do nothing.

## 1. Home / New audit — `/`

### Purpose

Explain the product in one sentence and let a first-time visitor start an evidence-grounded answer audit without setup or sign-in.

### Required content and behavior

- Product name and a short explanation: the answer is checked against the sources the user provides.
- Answer input with a clear label, character/length feedback, and a useful empty state.
- Source input supporting PDF/TXT upload and pasted source text, with selected filenames and a remove action.
- A clearly visible **Load demo example** action that fills both the example answer and its matching source.
- A primary **Audit answer** action, disabled until the answer and at least one source are present and valid.
- Upload/progress feedback, input-limit feedback, and readable API errors. Never display raw stack traces.
- A short note that findings are relative to the uploaded sources; the app is not independently proving real-world truth.

### Screenshot assessment and adjustments

The current screenshot is a strong visual starting point: its dark canvas, restrained gold accent, clear headline, answer input, source upload, and demo entry point make the product direction understandable. Keep that visual language.

Before calling the page finished:

- Make the primary **Audit answer** action discoverable without requiring a user to guess that more content is below the fold. It may follow the source input, but should be visible at a common laptop viewport or remain available in a clear sticky action area.
- Reduce the large gap between the top navigation and the main task if it pushes essential content below the fold.
- The global search and toolbar controls shown in the screenshot are not specified by the current API or core flow. Remove them for the first demo unless they perform a real, defined action.
- Keep the initial page focused on one job: entering an answer, supplying its sources, and starting the audit.
- Keep sidebar navigation to working destinations only. The demo should not present a source database, bookmarks, activity feed, or settings page unless those features are implemented.

### Home states to design

- Empty and ready to use.
- Demo example loaded.
- Files selected, uploading, uploaded, removed, or rejected with a clear reason.
- Missing answer or missing source.
- Oversized file, too many pages/files, unsupported type, scanned PDF, and long answer.
- Backend waking, request in progress, network failure, and rate limit.

## 2. Audit review — `/audit/[id]`

### Purpose

Make it easy to answer: “Which parts of this answer are questionable, and what exact source evidence supports that finding?”

### Required content and behavior

- Overall summary and counts for supported, contradicted, unsupported, and ambiguous claims.
- The normalized answer with claim spans highlighted using Unicode code-point offsets. Each status must have a label/icon as well as color.
- Selecting a highlighted claim selects its matching claim card and evidence panel; selecting a claim card highlights the answer span.
- Claim explanation, error type, confidence label, and relevant flags.
- Evidence cards only for quotes verified by the backend; show source name, page, and exact quote.
- **View in source** opens the Source viewer drawer/modal at the cited page and highlights the quote.
- Reasoning/safety findings are visually distinct from claim verdicts.
- While processing, show pending state and progress. Recover gracefully from a failed claim or audit without blanking the whole page.
- Show **Correct & re-audit** only when supported by the backend response; show whether the corrected claim was actually re-verified as supported.
- Link to the report after results are ready.

### Important rendering rule

Use `Array.from(answer_text)` or an equivalent code-point-safe helper for spans. Do not use JavaScript UTF-16 `string.slice`/`length` directly with backend offsets. Handle missing, overlapping, or invalid spans without crashing or highlighting unrelated text.

## 3. Source viewer — drawer or modal

This is part of Audit review, not a separate first-release route.

- Open at the cited source and page.
- Show the source name and page number, with the exact verified quote highlighted.
- Clearly distinguish the quote from surrounding source text.
- Provide a close action and return focus to the selected claim.
- If source text or offsets are unavailable, say so; do not invent a highlight.

## 4. Audit report — `/report/[id]`

### Purpose

Provide a shareable, print-friendly record of one audit, not a general dashboard.

### Required content and behavior

- Overall label and verdict counts.
- Audited answer with claim statuses.
- Claim table/list containing verdict, explanation, and verified source evidence with page references.
- Answer-level reasoning/safety findings, if present.
- Method note: verdicts are relative to uploaded sources; unsupported does not mean false.
- **Print / Save as PDF** action using the browser print dialog.
- Back to audit review and a way to start a new audit.
- Print stylesheet that removes app navigation and controls and avoids splitting evidence cards where practical.

Do not imply a permanent share link or saved report unless backend persistence and access behavior exist.

## Navigation and responsive behavior

- First-release navigation needs only the product mark and a working **New audit/Home** destination. An Audit review link may appear only when there is a current audit ID.
- Keep the layout usable on laptop and phone widths. On narrow screens, stack the answer and evidence panels; do not shrink the answer into an unreadable column.
- Give all icon-only controls accessible names and keyboard focus styles.
- Preserve a clear path back to Home from Audit review and Report.
- Do not add global search, list/grid switching, bookmark, history, database, or activity controls until their behavior and data source are specified.

## Shared non-page states

These are states of the routes above, not new product pages:

- Loading and partial audit results.
- Not found / expired audit ID.
- API unavailable, rate limited, or invalid input.
- No claims found or all claims could not be verified.
- Print view.

Each state should explain what happened and provide a useful next action. Never render an empty screen or raw error.

## First-release acceptance checklist

- A first-time user can identify the product, load the demo, and start an audit from Home.
- A result can be followed from a highlighted claim to a verified quote and its source page.
- The user can understand all four verdicts and the difference between unsupported and contradicted.
- The report prints cleanly and includes the source-relative methodology note.
- Every visible navigation item and control does something real.
- No frontend API key or secret is required or exposed.
- The core flow works against mock data and the deployed backend, including error and loading states.

