# Second Opinion: Team Plan

Read this first. Then read `01_API_CONTRACT.md` and your own role file (`02`-`05`). `06_DEPLOY_AND_CHECKS.md` is the runbook for deploys, smoke tests, and checkpoints.

## What we're building
An evidence-first AI answer auditor. The user pastes an AI answer and uploads the sources it should rely on. We split the answer into claims, verify each against the sources, and highlight every claim as **supported / contradicted / unsupported / ambiguous** with the exact source quote as proof. The user can then generate an evidence-grounded correction, re-audit it, and export a report.

Pitch line: *"Anyone can ask a second AI for an opinion. We show the evidence, and our code checks the evidence is real."*

## Settled decisions (do not re-debate)
1. **We do not train a model.** We build an audit engine: LLM + retrieval + our own deterministic verification. If a judge asks "what is your model?": five pieces of our own work: claim decomposition, evidence retrieval, evidence-grounded verdicts, deterministic validation, audit orchestration (plus correction and re-audit).
2. **One LLM provider (Gemini) for the core.** Jev, HHEM, extra judge models, and self-consistency are optional, behind flags, and only after Checkpoint 3.
3. **Users paste answers.** No ChatGPT/Claude account connection (consumer chats have no API for it). A browser extension is "future work" in the pitch.
4. **"Correct" means consistent with the uploaded sources**, not real-world truth. "Unsupported" is not "false".
5. **The LLM never gives us trusted character offsets or citations.** It returns text; our code locates spans and verifies quotes verbatim.
6. **Contract first, mocks first.** Everyone builds in parallel against `01_API_CONTRACT.md` and the files in `mock/`.
7. Supabase Auth and Postgres/Storage persist account-owned audit history and source documents. Chunk embeddings are cached for repeated audits. No training or scraping chat sessions.

## Scope
| Priority | Features |
|---|---|
| MUST | Paste answer + upload PDF/TXT; claim extraction; retrieval; verdict with verified quote; highlighted answer + evidence panel; golden example passes; evaluation numbers |
| SHOULD | Streaming results; Correct & re-audit; report page (print to PDF); reasoning + safety findings; confidence label; hybrid retrieval (BM25 + embeddings) |
| COULD | Jev / HHEM extra signals; self-consistency (3 runs); "ask a model" mode that generates an answer from the sources |
| WON'T | Account integrations; browser extension; login; training or fine-tuning; OCR for scanned PDFs |

## Team and ownership
Assign by strength: best React developer takes P3, strongest Python/LLM person takes P1, the most detail-oriented takes P2, the best organizer/speaker takes P4 (also leads the pitch).

| Person | Role | Owns (only edit these paths) | Role file |
|---|---|---|---|
| P1 | Backend pipeline | `backend/app/main.py`, `models.py`, `pipeline/`, `prompts/` | `02_P1_BACKEND_PIPELINE.md` |
| P2 | Backend verification and features | `backend/app/validation/`, `features/`, `routes/sources.py`, `Dockerfile`, backend deploy | `03_P2_BACKEND_VERIFICATION.md` |
| P3 | Frontend | `frontend/` | `04_P3_FRONTEND.md` |
| P4 | Evaluation, demo, QA | `eval/`, `data/`, `scripts/`, `docs/`, slides, demo video | `05_P4_EVAL_DEMO_QA.md` |

Directory ownership prevents merge conflicts. If you need a change in someone else's directory, ask them in chat or open an issue. Do not edit it yourself.

## Repo layout (monorepo)
```
second-opinion/
  docs/            these .md files
  frontend/        Next.js app (deployed on Vercel)
  backend/
    app/
      main.py  models.py
      routes/  pipeline/  validation/  features/  prompts/
    tests/
    Dockerfile  requirements.txt  .env.example
  eval/            dataset.jsonl, run_eval.py, baseline.py, results/
  data/            golden example files (given), demo documents
  mock/            audit.json, sources.json (given; copy to frontend/public/mock/)
  scripts/         smoke.py, warm.sh
```

## Rules for working in parallel
- **Contract is law.** Any change to `01_API_CONTRACT.md` is announced in the team chat, version-bumped, and agreed by P1 and P3 before merging.
- **Mock first.** P3 builds against `mock/` and a deployed `/api/mock/audit`. P1 serves the same JSON, so integration works from hour 1.
- **Small branches.** Name them `p1/claim-extraction`. Open a PR within a few hours. Another person reviews and merges within 30 minutes. Never keep a branch alive for a day.
- **A PR merges only if** it builds, `pytest` passes (backend), and the smoke test is green (anything touching the pipeline).
- **No secrets in git.** Keys live in `.env` (local) and host dashboards (deployed). Only `NEXT_PUBLIC_*` variables reach the browser, and never a key.
- **Prompts are code.** Prompts live in `backend/app/prompts/`, reviewed like code. Few-shot examples must NOT come from `data/` or `eval/` (no leakage into our own evaluation).
- **Everyone labels data at H4.** The evaluation set needs 60+ labeled claims, and labeling parallelizes well.

## Timeline (H0 = start of the hackathon)
| Hour | Checkpoint | Pass criteria |
|---|---|---|
| H0-1 | Setup (all together) | Repo, keys, `.env.example`, contract read, roles confirmed |
| H1-2 | **CP1: walking skeleton** | Vercel URL loads, calls the deployed backend `/health` and `/api/mock/audit`, renders mock highlights; streaming tested on the deployed host (or polling fallback chosen) |
| H2-6 | Build v0 | Real extraction, retrieval, verdicts, validators (no streaming needed) |
| H6 | **CP2: first real audit** | Golden example works on the deployed stack: paste, upload, real verdicts; smoke test passes at least 4/5 |
| H6-12 | Build v1 | Streaming, correction + re-audit, reasoning/safety, confidence, first eval run |
| H12 | **CP3: core complete** | All three demo features visible; first eval numbers; 50+ labeled claims |
| H12-18 | Improve | Fix top failure types from eval; report page; polish; optional signals only if CP3 is green |
| H18 | **CP4: feature freeze** | No new features after this. Only fixes, polish, evaluation, slides |
| H21 | **CP5: demo freeze** | Tag `demo-v1`; backup video recorded; only P4-approved fixes merge |
| H21-24 | Rehearse | Three full run-throughs, one on a phone hotspot. Sleep if you can |

## If we fall behind: cut in this order
1. Optional signals (Jev, HHEM, self-consistency)
2. Report polish
3. Answer-level reasoning/safety findings
4. Streaming (use polling)
5. Correct & re-audit

**Never cut:** verified quotes, highlighted answer + evidence panel, golden example passing, evaluation numbers.

## Demo flow (what we are building toward)
1. Click **Load demo example** (refund policy). Click **Audit**.
2. Claims light up one by one as results stream in.
3. Click a red claim: show the exact policy page and highlighted quote plus explanation.
4. Click **Correct & re-audit**: corrected sentence appears, re-verified as supported.
5. Open the report page; show Print/PDF.
6. Hand the judges a laptop: they paste their own answer and PDF.
7. Results slide: precision/recall vs the naive "just ask an LLM" baseline.

---
# v1.1 additions

## Production touches (cheap, visible, judges notice)
| # | Item | Owner | When |
|---|---|---|---|
| 1 | CI on GitHub Actions (`ci/ci.yml` in this kit): pytest + frontend build on every PR | P4 | H1-2 |
| 2 | One backend instance (state in memory) behind an `AuditStore` interface; Redis (Upstash) only after CP3 | P1 interface, P2 deploy flag | H2; Redis optional |
| 3 | Prompt-injection hardening + one adversarial document in the eval set | P1 prompts, P4 test | H6-12 |
| 4 | Input limits + per-IP rate limiting + friendly errors | P2 backend, P3 messages | H6-12 |
| 5 | Privacy: auto-delete uploads/audits after 60 min; never log document text | P2 | H6-12 |
| 6 | Structured logs with `X-Request-ID` | P2 | H2-6 |
| 7 | Pipeline trace + "How this was checked" drawer | P1 produces, P3 renders | H8-14 |

Deliberately NOT used: Kubernetes, Kafka/RabbitMQ/Celery, a vector database, microservices, fine-tuning. They add failure points without adding score.

## Which file does each person read
| File | P1 | P2 | P3 | P4 |
|---|---|---|---|---|
| `00_TEAM_PLAN.md` | read fully | read fully | read fully | read fully |
| `01_API_CONTRACT.md` | read fully | read fully | read fully | read fully |
| `02_P1_BACKEND_PIPELINE.md` | **owner** | skim | skip | skim |
| `03_P2_BACKEND_VERIFICATION.md` | skim | **owner** | skip | skim |
| `04_P3_FRONTEND.md` | skip | skip | **owner** | skim |
| `05_P4_EVAL_DEMO_QA.md` | skim (eval failures) | skim | skip | **owner** |
| `06_DEPLOY_AND_CHECKS.md` | deploy section | deploy section | deploy section | **owner** |

Put all files in `docs/` in the repo. Tell each coding assistant: "Read docs/00_TEAM_PLAN.md, docs/01_API_CONTRACT.md and docs/<your role file> before writing code, and follow them exactly."

## Who does what, hour by hour
| Hours | P1 Pipeline | P2 Verification | P3 Frontend | P4 Eval/QA |
|---|---|---|---|---|
| 0-1 | Setup together: repo, keys, read contract | same | same | same |
| 1-2 | FastAPI skeleton, mock endpoints, Pydantic models, deploy | `/api/sources`, PDF extraction, Dockerfile, deploy | Next.js app, mock mode, Vercel deploy | Repo rules, CI, smoke script, golden PDF |
| 2-6 | claims, retrieval, verdicts, assemble | validators + unit tests | home screen, highlighter, evidence inspector | start labeling dataset, eval runner skeleton |
| 6-12 | parallelism, streaming, cache, AuditStore, trace | confidence, reasoning/safety, correction, limits, logs, privacy | streaming hook + polling fallback, correction UI, filters, error states | 60+ labeled claims, first eval + baseline |
| 12-18 | fix failures from eval, injection hardening | harden validators, optional signals only if CP3 green | report page, trace drawer, polish, mobile | test-split eval, charts, slides draft |
| 18-21 | bug bash, performance | edge cases | UI bug bash, empty states | final numbers, backup video, hardening checklist |
| 21-24 | rehearse, fix only | rehearse, fix only | drives the demo | leads the pitch, rehearsals |
