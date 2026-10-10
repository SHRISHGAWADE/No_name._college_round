# P4: Evaluation, Demo and QA

You own: `eval/`, `data/`, `scripts/`, `docs/`, the slides, the demo video, and the checkpoint runs. You are also the integration captain: at every checkpoint you decide whether we pass.

Your evaluation is our biggest advantage: most teams will say "it works". We show numbers.

## Hour 0-2
- [ ] Set up repo skeleton, `.env.example`, branch rules, and a shared checklist (GitHub issues or a pinned doc).
- [ ] Copy `data/` and `mock/` from the kit. Make a 2-page PDF from `golden_source_page1.txt` + `page2.txt` (for page-tracking tests).
- [ ] Write `scripts/smoke.py` (see `06_DEPLOY_AND_CHECKS.md`). It is the heartbeat of the whole project.

## Evaluation dataset (`eval/dataset.jsonl`), H2-12
One JSON object per line:
```json
{"id": "d01", "source_files": ["data/eval/d01_source.txt"], "answer": "...",
 "claims": [{"span_text": "exact text from answer", "label": "contradicted", "error_type": "wrong_number"}]}
```
- **At least 10 source documents and 60+ labeled claims.** Suggested mix: about 40% supported, 20% contradicted, 25% unsupported, 15% ambiguous.
- Domains: a college handbook excerpt, a product/refund policy, a medical leaflet (safety cases), a short article, a technical doc.
- Method: have an LLM write answers about each source, then hand-edit in planted errors (wrong number, reversed fact, fabricated detail, unsupported addition, logical leap). **Verify every label by hand.** Use the verdict definitions in the contract.
- Have two people label the same 15 claims; resolve disagreements (this also sharpens the definitions).
- **Split 50/50 into dev and test.** P1/P2 tune on dev only. We report **test** numbers.
- Everyone helps label at H4.

## Evaluation runner (`eval/run_eval.py`)
- For each document: upload the source, run an audit, fetch the final result (use the non-streaming GET).
- Match predicted claims to gold claims by answer-span overlap (IoU at least 0.5). Unmatched gold claims count as missed.
- Report: per-verdict precision/recall/F1, confusion matrix, and the **headline number**: error detection (contradicted + unsupported vs the rest) precision and recall. Also report quote-verified rate (must be 100% for displayed evidence) and median latency per audit.
- Save `eval/results/results.json` and PNG charts (matplotlib) for the slides.

## Baseline (`eval/baseline.py`), our proof that the design matters
Same Gemini model, single prompt: "Here are sources and an answer; list the errors with evidence." Parse its output and score it with the same metrics. Also measure how many of its quoted "evidence" strings actually exist in the source (fabricated-evidence rate). Compare on one slide: ours vs naive, per class.

## Demo scenarios (`data/demo/`)
1. **Refund policy (golden):** clean 5 claims, shows all verdict types.
2. **College handbook:** relatable to judges and the practical use case.
3. **Medical leaflet:** shows the safety finding.
Pre-run all three on the production URL so they are cached and instant.

## Hardening checklist (judges may bring their own input)
- [ ] Empty answer / empty source
- [ ] Very long answer (claim cap notice works)
- [ ] Scanned PDF with no text layer (clear message)
- [ ] Answer with bullets/markdown, numbers, dates, units
- [ ] Answer that is pure opinion (no factual claims) shows a friendly message
- [ ] Non-English text, emoji, curly quotes
- [ ] Two sources uploaded at once
- [ ] Backend cold start and rate-limit errors handled in the UI

## Pitch (5 minutes) and slides (7)
1. **Hook (30 s):** a confident AI answer with a fabricated detail.
2. **Why "ask another AI" fails (30 s):** it repeats mistakes and invents evidence.
3. **Our approach (45 s):** one architecture diagram; stress that code verifies the evidence.
4. **Live demo (2 min):** demo flow in `00_TEAM_PLAN.md`; let a judge paste their own input.
5. **Results (45 s):** test-set precision/recall and the baseline comparison.
6. **Limits (20 s):** relative to sources only; no scanned PDFs yet; known weak spots from the eval.
7. **Roadmap (10 s):** account integrations, browser extension, calibrated confidence.

Prepare answers for: "What is your model?", "Why not just ask GPT to check?", "What if the source itself is wrong?", "How do you handle ambiguity?", "How does it scale?".

## Final tasks
- H18: final eval run on the test split; export charts.
- H21: record the **backup demo video** on the production URL; tag `demo-v1`.
- H21-24: three timed rehearsals, one on a phone hotspot.

## Definition of done
Test-set numbers and charts exist, the baseline comparison exists, the smoke test passes on production, three demo scenarios are cached, backup video recorded.

## Instructions for your coding assistant
- Evaluation code is plain Python (requests, pandas, scikit-learn, matplotlib). Keep it deterministic and re-runnable with the backend's disk cache.
- Never tune prompts on the test split. Never put eval or golden examples into prompts.
- Report failures honestly; do not drop bad categories from charts.

---
# v1.1 additions
- **CI:** copy `ci/ci.yml` to `.github/workflows/ci.yml` in hour 1-2 and require it to be green before merging to `main`.
- **Adversarial source:** add at least one eval document whose source contains injection text ("ignore previous instructions..."). Report "injection resistance: X of Y unchanged verdicts" as a result.
- Mention in the pitch: input limits, rate limiting, auto-deletion of uploads, and the trace drawer. One sentence each.
