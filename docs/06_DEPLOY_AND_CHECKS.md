# Deploy and Checks: how we know it works

## Yes: deploy a basic frontend to Vercel in hour 1 and keep deploying
Walking skeleton first, features after. By H2 the full chain (browser, Vercel, backend host, Gemini) must work with fake data. Every later change is then a small step on a working system, and integration problems show up in hour 2, not hour 22.

## Environments
| Env | Frontend | Backend |
|---|---|---|
| Local | `npm run dev` | `uvicorn app.main:app --reload` |
| Preview | Vercel preview URL (one per PR/branch, automatic) | the shared deployed backend |
| Production / demo | Vercel `main` URL | deployed backend from `main` (auto-deploy from GitHub) |

From H18 the backend deploys only from `main`, and from H21 only P4-approved fixes merge.

## Hosting
- **Frontend:** Vercel, Root Directory `frontend`.
- **Backend:** Google Cloud Run or Render, from the `Dockerfile`. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- Free tiers can sleep when idle (cold start of many seconds). Check current limits. Mitigate: run `scripts/warm.sh` before demos; consider a minimum instance count if the budget allows.
- Python needs CORS for the Vercel domain and its preview domains (`*.vercel.app` regex).
- Heavy local models (HHEM/torch) will not fit small hosts. Keep them flagged off in the deployed build.

## Environment variables
| Variable | Where | Notes |
|---|---|---|
| `GEMINI_API_KEY` | backend host + local `.env` | Backend only. Never in the frontend |
| `NEXT_PUBLIC_API_BASE` | Vercel | e.g. `https://our-backend.example.com` |
| `NEXT_PUBLIC_USE_MOCK` | local / preview | `1` uses mock JSON |
| `MOCK` | backend | `1` serves canned data with delays |
| `CACHE_DIR` | backend | default `backend/.cache` |
| `ENABLE_JEV`, `ENABLE_HHEM` | backend | default `0` |

Give every developer their own dev key plus a separate key for the deployed backend, so one person's eval run cannot exhaust the demo's quota. Provide a spare key for demo day.

## Three layers of checks
1. **Per PR:** frontend `npm run build` + typecheck; backend `pytest`. Vercel preview URL for visual review.
2. **Deployed smoke test:** `python scripts/smoke.py $BACKEND_URL` runs the golden example end to end and fails loudly. Run it after every backend deploy, at every checkpoint, and before the demo.
3. **Checkpoints (below):** the whole team stops for 10-15 minutes, P4 runs the checklist on the production URLs.

## `scripts/smoke.py`
```python
import json, sys, time, requests

BASE = sys.argv[1].rstrip("/")
EXPECTED = json.load(open("data/golden_expected.json"))   # {"1": "contradicted", ...}
answer = open("data/golden_answer.txt", encoding="utf-8").read().strip()

r = requests.get(f"{BASE}/health", timeout=60); r.raise_for_status()

with open("data/golden_source.txt", "rb") as f:
    r = requests.post(f"{BASE}/api/sources", files=[("files", ("refund_policy.txt", f))], timeout=60)
r.raise_for_status()
source_ids = [s["source_id"] for s in r.json()["sources"]]

r = requests.post(f"{BASE}/api/audit", json={"answer": answer, "source_ids": source_ids}, timeout=60)
r.raise_for_status()
audit_id = r.json()["audit_id"]

t0 = time.time()
while True:
    res = requests.get(f"{BASE}/api/audit/{audit_id}", timeout=60).json()
    if res["status"] in ("done", "error") or time.time() - t0 > 120:
        break
    time.sleep(1)

claims = sorted(res["claims"], key=lambda c: c["answer_span"]["start"])
problems = []
if res["status"] != "done": problems.append(f"status={res['status']}")
if len(claims) != len(EXPECTED): problems.append(f"expected {len(EXPECTED)} claims, got {len(claims)}")
for i, c in enumerate(claims, 1):
    exp = EXPECTED.get(str(i))
    ok = c["verdict"] == exp
    ev_ok = all(e["quote_verified"] for e in c["evidence"])
    print(f"{i}. {c['verdict']:<12} expected {exp:<12} {'OK' if ok and ev_ok else 'FAIL'}  {c['text'][:50]}")
    if not ok: problems.append(f"claim {i}: {c['verdict']} != {exp}")
    if not ev_ok: problems.append(f"claim {i}: unverified evidence")
print(f"time: {time.time() - t0:.1f}s")
if problems:
    print("FAILED:", *problems, sep="\n  "); sys.exit(1)
print("SMOKE TEST PASSED")
```
Run from the repo root so the `data/` paths resolve. (`warm.sh`: `curl -s $BACKEND_URL/health` in a loop before the demo.)

## Checkpoint checklists (P4 runs; everyone watches)
**CP1 (H1-2): walking skeleton**
- [ ] Vercel URL opens; **Load demo example** works in mock mode
- [ ] Deployed frontend successfully calls deployed backend `/health` and `/api/mock/audit`
- [ ] SSE streaming works on the deployed host (otherwise polling fallback is confirmed)
- [ ] CORS works from the Vercel URL and from a preview URL

**CP2 (H6): first real audit**
- [ ] Smoke test: at least 4/5 verdicts correct on the deployed backend
- [ ] Real PDF upload works (use the 2-page golden PDF); evidence shows the right page
- [ ] UI shows real highlights and evidence from the real backend

**CP3 (H12): core complete**
- [ ] Streaming, Correct & re-audit, evidence viewer all work on production
- [ ] 50+ labeled claims; first eval numbers (dev split) posted in chat
- [ ] Hardening checklist items started

**CP4 (H18): feature freeze**
- [ ] Report page prints to a clean PDF
- [ ] Test-split eval + baseline numbers exist; charts exported
- [ ] Optional features either in (and evaluated) or cut

**CP5 (H21): demo freeze**
- [ ] Smoke test 5/5, three times in a row
- [ ] Tag `demo-v1`; production URLs bookmarked
- [ ] Backup video recorded; demo scenarios cached; backend warmed
- [ ] Tested on a phone hotspot and on a second laptop

## Failure playbook
| Symptom | Likely cause / fix |
|---|---|
| Frontend works locally, fails on Vercel | `NEXT_PUBLIC_API_BASE` missing/wrong; CORS; mixed http/https |
| First request takes 30+ s | Backend cold start. Run `warm.sh`; add retry UI |
| Results do not stream | Proxy buffering. Switch to polling (contract allows it) |
| Verdicts suddenly all `error` | Gemini quota/rate limit. Check the key; use cache; switch to the spare key |
| Evidence disappears | `verify_quote` rejecting valid quotes: check PDF line breaks/hyphenation normalization |
| Highlights are shifted | Offsets mismatch: code points vs UTF-16. Frontend must slice with `Array.from` |
| Merge broke everything | Revert the PR; fix on a branch; re-run smoke before merging again |
| Hosted backend is down at demo time | Run the backend on a laptop and expose it with a tunnel (e.g. cloudflared/ngrok); set `NEXT_PUBLIC_API_BASE`; else show the backup video |

## Rate-limit hygiene
Disk-cache all LLM calls; evaluation reruns hit the cache; never loop evals blindly; keep demo inputs pre-run on production; keep one spare key.

## Demo-day checklist
- [ ] Production smoke test passes right before the session
- [ ] Backend warmed; spare key ready; backup video on the laptop
- [ ] Laptop charged, browser zoom checked, notifications off
- [ ] Roles: one person talks, one drives the demo, two watch for failures and have the fallback ready

---
# v1.1 additions
- **CI:** `ci/ci.yml` runs backend tests and the frontend build on every PR (P4 sets it up in H1-2).
- **Single instance:** deploy the backend with one instance (Cloud Run `--max-instances 1`) while audit state is in memory. If you add Redis after CP3, remove that limit.
- **Runtime env vars:** `MAX_FILE_MB` (10), `RETENTION_MIN` (60), `RATE_LIMIT_DISABLED` (0; set to 1 on demo day). The current no-login demo keeps state in memory and needs no external database credentials.
- **CP2 addition:** check that an oversized file and a scanned PDF each show a friendly error, not a crash.
