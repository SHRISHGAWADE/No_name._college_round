"""End-to-end smoke test on deployed or local backend."""
import json
import sys
import time
import requests

if len(sys.argv) < 2:
    print("Usage: python scripts/smoke.py <BACKEND_URL>")
    sys.exit(1)

BASE = sys.argv[1].rstrip("/")
EXPECTED = json.load(open("data/golden_expected.json", encoding="utf-8"))   # {"1": "contradicted", ...}
answer = open("data/golden_answer.txt", encoding="utf-8").read().strip()

print(f"Checking health at {BASE}/health ...")
r = requests.get(f"{BASE}/health", timeout=60)
r.raise_for_status()

print("Uploading golden source...")
with open("data/golden_source.txt", "rb") as f:
    r = requests.post(f"{BASE}/api/sources", files=[("files", ("refund_policy.txt", f))], timeout=60)
r.raise_for_status()
source_ids = [s["source_id"] for s in r.json()["sources"]]

print(f"Initiating audit with source IDs: {source_ids} ...")
r = requests.post(f"{BASE}/api/audit", json={"answer": answer, "source_ids": source_ids}, timeout=60)
r.raise_for_status()
audit_id = r.json()["audit_id"]

print(f"Polling audit {audit_id} ...")
t0 = time.time()
while True:
    res = requests.get(f"{BASE}/api/audit/{audit_id}", timeout=60).json()
    if res.get("status") in ("done", "error") or time.time() - t0 > 120:
        break
    time.sleep(1)

claims = sorted(res.get("claims", []), key=lambda c: c["answer_span"]["start"])
problems = []
if res.get("status") != "done":
    problems.append(f"status={res.get('status')}")
    if res.get("error"):
        problems.append(f"error={res.get('error')}")
if len(claims) != len(EXPECTED):
    problems.append(f"expected {len(EXPECTED)} claims, got {len(claims)}")
for i, c in enumerate(claims, 1):
    exp = EXPECTED.get(str(i))
    ok = c["verdict"] == exp
    ev_ok = all(e["quote_verified"] for e in c["evidence"])
    print(f"{i}. {c['verdict']:<12} expected {exp:<12} {'OK' if ok and ev_ok else 'FAIL'}  {c['text'][:50]}")
    if not ok:
        problems.append(f"claim {i}: {c['verdict']} != {exp}")
    if not ev_ok:
        problems.append(f"claim {i}: unverified evidence")
print(f"time: {time.time() - t0:.1f}s")
if problems:
    print("FAILED:", *problems, sep="\n  ")
    sys.exit(1)
print("SMOKE TEST PASSED")
