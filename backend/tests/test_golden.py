"""End-to-end golden example tests."""
import json
import os
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Page
from app.validation.quotes import verify_quote
from app.store import store

client = TestClient(app)


def test_golden_mock_pipeline_and_expected_verdicts():
    root = Path(__file__).parent.parent.parent
    expected_path = root / "data" / "golden_expected.json"
    golden_source_path = root / "data" / "golden_source.txt"
    golden_answer_path = root / "data" / "golden_answer.txt"

    if not expected_path.exists() or not golden_source_path.exists() or not golden_answer_path.exists():
        pytest.skip("Golden fixtures missing")

    expected = json.loads(expected_path.read_text(encoding="utf-8"))
    source_text = golden_source_path.read_text(encoding="utf-8")
    answer = golden_answer_path.read_text(encoding="utf-8")

    # Fetch mock audit
    res = client.get("/api/mock/audit")
    assert res.status_code == 200
    audit_data = res.json()

    claims = sorted(audit_data.get("claims", []), key=lambda c: c["answer_span"]["start"])
    assert len(claims) == len(expected)

    pages = [Page(page=1, text=source_text)]

    for i, claim in enumerate(claims, 1):
        exp_verdict = expected[str(i)]
        assert claim["verdict"] == exp_verdict, f"Claim {i} verdict mismatch: {claim['verdict']} != {exp_verdict}"
        # Evidence quotes must verify
        for ev in claim.get("evidence", []):
            match = verify_quote(ev["quote"], pages)
            assert match is not None, f"Claim {i} quote failed verification: {ev['quote']}"
            assert ev.get("quote_verified", False) is True


@pytest.mark.live
def test_golden_live_run():
    """Live audit with real Gemini API key (skipped if GEMINI_API_KEY not set)."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        pytest.skip("GEMINI_API_KEY not set")

    root = Path(__file__).parent.parent.parent
    golden_source_path = root / "data" / "golden_source.txt"
    golden_answer_path = root / "data" / "golden_answer.txt"

    source_text = golden_source_path.read_text(encoding="utf-8")
    answer = golden_answer_path.read_text(encoding="utf-8")

    # Upload source
    upload_res = client.post(
        "/api/sources",
        files=[("files", ("golden_source.txt", source_text.encode("utf-8"), "text/plain"))],
    )
    assert upload_res.status_code == 200
    source_id = upload_res.json()["sources"][0]["source_id"]

    # Start audit
    audit_res = client.post("/api/audit", json={"answer": answer, "source_ids": [source_id]})
    assert audit_res.status_code == 200
    audit_id = audit_res.json()["audit_id"]

    # Poll until done
    import time
    t0 = time.time()
    result = None
    while time.time() - t0 < 60:
        res = client.get(f"/api/audit/{audit_id}")
        assert res.status_code == 200
        data = res.json()
        if data.get("status") in ("done", "error"):
            result = data
            break
        time.sleep(1)

    assert result is not None
    assert result["status"] == "done"
    assert len(result.get("claims", [])) >= 4
