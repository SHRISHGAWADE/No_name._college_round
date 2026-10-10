"""Tests for error handling during audits: safe error messages, tracebacks, and API responses."""
import logging
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.models import AuditResult
from app.pipeline.orchestrator import format_safe_error, run_audit
from app.store import store

client = TestClient(app)


def test_format_safe_error_redacts_api_keys():
    fake_key = "AIzaSyD-1234567890abcdefghijklmnopqrst"
    exc = ValueError(f"Failed to connect to Google API with key={fake_key}")

    with patch("app.config.GEMINI_API_KEY", fake_key):
        safe_msg = format_safe_error(exc)

    assert fake_key not in safe_msg
    assert "[REDACTED]" in safe_msg
    assert safe_msg.startswith("ValueError:")


def test_format_safe_error_truncates_long_messages():
    huge_text = "A" * 500
    exc = RuntimeError(f"Buffer overflow: {huge_text}")
    safe_msg = format_safe_error(exc)
    assert len(safe_msg) <= 300
    assert safe_msg.endswith("...")
    assert safe_msg.startswith("RuntimeError:")


@pytest.mark.asyncio
async def test_run_audit_failure_stores_error_and_logs_traceback(caplog):
    audit_id = "test_err_audit"
    initial = AuditResult(
        audit_id=audit_id,
        status="running",
        created_at="2026-10-10T00:00:00Z",
        answer_text="Sample answer text.",
        source_ids=["s1"],
    )
    store.set_audit(audit_id, initial)

    fake_exc = RuntimeError("Simulated Gemini quota exceeded 429")

    with caplog.at_level(logging.ERROR):
        with patch("app.pipeline.orchestrator._make_client", side_effect=fake_exc):
            await run_audit(audit_id, "Sample answer text.", ["s1"])

    result = store.get_audit(audit_id)
    assert result is not None
    assert result.status == "error"
    assert result.error is not None
    assert "RuntimeError: Simulated Gemini quota exceeded 429" in result.error

    # Verify GET /api/audit/{id} returns both status: "error" and the error message
    res = client.get(f"/api/audit/{audit_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "error"
    assert data["error"] == result.error

    # Verify log contained the traceback / exception info
    assert any("audit_failed" in record.message for record in caplog.records)
    assert any(record.exc_info is not None for record in caplog.records)
