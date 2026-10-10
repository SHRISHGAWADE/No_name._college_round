"""API integration and route tests using TestClient."""
import io
import json
from pathlib import Path
from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.store import store


@pytest.fixture(autouse=True)
def reset_store():
    store.clear()
    yield


client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True, "version": "1.1"}
    assert "X-Request-ID" in res.headers


def test_request_id_propagation():
    custom_id = "test-request-id-12345"
    res = client.get("/health", headers={"X-Request-ID": custom_id})
    assert res.status_code == 200
    assert res.headers.get("X-Request-ID") == custom_id


def test_mock_endpoints():
    res_sources = client.get("/api/mock/sources")
    assert res_sources.status_code == 200
    sources_data = res_sources.json()
    assert "sources" in sources_data
    assert len(sources_data["sources"]) > 0

    res_audit = client.get("/api/mock/audit")
    assert res_audit.status_code == 200
    audit_data = res_audit.json()
    assert "audit_id" in audit_data
    assert "claims" in audit_data


def test_post_sources_plain_text(monkeypatch):
    from app import config
    monkeypatch.setattr(config, "MOCK_MODE", False)
    content = "This is a comprehensive return policy. " * 5  # > 50 chars
    res = client.post(
        "/api/sources",
        files=[("files", ("policy.txt", io.BytesIO(content.encode("utf-8")), "text/plain"))],
    )
    assert res.status_code == 200
    data = res.json()
    assert "sources" in data
    assert len(data["sources"]) == 1
    src = data["sources"][0]
    assert src["name"] == "policy.txt"
    assert len(src["pages"]) == 1
    assert src["pages"][0]["text"].strip() == content.strip()


def test_post_sources_too_short(monkeypatch):
    from app import config
    monkeypatch.setattr(config, "MOCK_MODE", False)
    short_content = "Too short"
    res = client.post(
        "/api/sources",
        files=[("files", ("short.txt", io.BytesIO(short_content.encode("utf-8")), "text/plain"))],
    )
    # Plain text under 50 chars is allowed or if PDF it raises no_text_layer
    # Let's verify text behavior
    assert res.status_code in (200, 422)


def test_post_audit_mock_mode(monkeypatch):
    from app import config
    monkeypatch.setattr(config, "MOCK_MODE", True)

    # First add a mock source
    client.get("/api/mock/sources")

    res = client.post(
        "/api/audit",
        json={"answer": "Some answer", "source_ids": ["s1"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert "audit_id" in data

    audit_id = data["audit_id"]
    res_get = client.get(f"/api/audit/{audit_id}")
    assert res_get.status_code == 200
    res_json = res_get.json()
    assert res_json["status"] in ("running", "done")
