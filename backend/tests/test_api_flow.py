from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def test_mock_audit_end_to_end() -> None:
    root = Path(__file__).resolve().parents[2]
    expected = json.loads((root / "data" / "golden_expected.json").read_text(encoding="utf-8"))
    answer = (root / "data" / "golden_answer.txt").read_text(encoding="utf-8").strip()

    with TestClient(app) as client:
        source_response = client.post(
            "/api/sources",
            files=[("files[]", ("demo.pdf", b"mock file contents", "application/pdf"))],
        )
        assert source_response.status_code == 200
        assert source_response.json()["sources"][0]["source_id"] == "s1"

        start_response = client.post("/api/audit", json={"answer": answer, "source_ids": ["s1"]})
        assert start_response.status_code == 200
        audit_id = start_response.json()["audit_id"]

        result_response = client.get(f"/api/audit/{audit_id}")
        assert result_response.status_code == 200
        result = result_response.json()
        assert result["status"] == "done"
        claims = sorted(result["claims"], key=lambda claim: claim["answer_span"]["start"])
        assert [claim["verdict"] for claim in claims] == [expected[str(i)] for i in range(1, 6)]
        assert all(evidence["quote_verified"] for claim in claims for evidence in claim["evidence"])

        stream_response = client.get(f"/api/audit/{audit_id}/stream")
        assert stream_response.status_code == 200
        assert "event: claims" in stream_response.text
        assert "event: done" in stream_response.text


def test_json_source_upload_and_request_id(monkeypatch) -> None:
    from app import config
    monkeypatch.setattr(config, "MOCK_MODE", False)
    with TestClient(app) as client:
        response = client.post(
            "/api/sources",
            json={"name": "policy.txt", "text": "Refund requests are accepted for 30 days."},
            headers={"X-Request-ID": "prototype-check"},
        )
        assert response.status_code == 200
        assert response.headers["X-Request-ID"] == "prototype-check"
        source = response.json()["sources"][0]
        assert source["pages"] == [{"page": 1, "text": "Refund requests are accepted for 30 days."}]


def test_api_errors_use_contract_envelope() -> None:
    with TestClient(app) as client:
        response = client.get("/api/audit/missing-audit")
        assert response.status_code == 404
        assert set(response.json()) == {"error"}
        assert response.json()["error"]["code"] == "not_found"
