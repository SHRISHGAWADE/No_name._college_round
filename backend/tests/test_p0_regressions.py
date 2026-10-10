"""Regression tests for the P0 runtime and evidence-trust fixes."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.models import AuditResult, Claim, Page, Source
from app.pipeline import claims as claims_module
from app.pipeline import orchestrator
from app.pipeline import retrieval
from app.pipeline import verdict as verdict_module
from app.pipeline.claims import ClaimExtractionError, extract_claims
from app.pipeline.retrieval import RetrievalIndex
from app.pipeline.verdict import evaluate_claim
from app.routes import sources as sources_route
from app.store import store


class _NoCache:
    def get(self, model: str, prompt: str):
        return None

    def set(self, model: str, prompt: str, value: str) -> None:
        pass


@pytest.mark.asyncio
async def test_malformed_claim_json_is_an_error(monkeypatch) -> None:
    monkeypatch.setattr(claims_module, "get_cache", lambda: _NoCache())
    client = MagicMock()
    client.models.generate_content.return_value = SimpleNamespace(text="not json")

    with pytest.raises(ClaimExtractionError):
        await extract_claims("A factual answer.", client, "test-model")

    client.models.generate_content.return_value = SimpleNamespace(text="")
    with pytest.raises(ClaimExtractionError):
        await extract_claims("A factual answer.", client, "test-model")


@pytest.mark.asyncio
async def test_valid_empty_claim_list_is_not_an_extraction_error(monkeypatch) -> None:
    monkeypatch.setattr(claims_module, "get_cache", lambda: _NoCache())
    client = MagicMock()
    client.models.generate_content.return_value = SimpleNamespace(text="[]")

    assert await extract_claims("An opinion without factual claims.", client, "test-model") == []

    store.clear()
    audit = AuditResult(
        audit_id="a_no_claims",
        status="running",
        created_at="2026-10-10T00:00:00+00:00",
        answer_text="An opinion without factual claims.",
        source_ids=[],
    )
    store.set_audit(audit.audit_id, audit)
    store.get_or_create_queue(audit.audit_id)
    monkeypatch.setattr(orchestrator, "_make_client", lambda: MagicMock())
    monkeypatch.setattr(orchestrator, "extract_claims", lambda *args, **kwargs: asyncio.sleep(0, result=[]))

    await orchestrator.run_audit(audit.audit_id, audit.answer_text, [])
    await asyncio.sleep(0)

    assert store.get_audit(audit.audit_id).status == "done"
    assert (await store.get_or_create_queue(audit.audit_id).get())["event"] == "done"


@pytest.mark.asyncio
async def test_extraction_failure_marks_audit_error_and_streams_error(monkeypatch) -> None:
    async def fail_extract(*args, **kwargs):
        raise ClaimExtractionError("bad response")

    store.clear()
    audit = AuditResult(
        audit_id="a_extract_error",
        status="running",
        created_at="2026-10-10T00:00:00+00:00",
        answer_text="Answer",
        source_ids=[],
    )
    store.set_audit(audit.audit_id, audit)
    store.get_or_create_queue(audit.audit_id)
    monkeypatch.setattr(orchestrator, "_make_client", lambda: MagicMock())
    monkeypatch.setattr(orchestrator, "extract_claims", fail_extract)

    await orchestrator.run_audit(audit.audit_id, audit.answer_text, [])

    assert store.get_audit(audit.audit_id).status == "error"
    event = await store.get_or_create_queue(audit.audit_id).get()
    assert event["event"] == "error"
    assert event["data"]["error"]["code"] == "claim_extraction_failed"


def test_invalid_pasted_source_request_returns_422(monkeypatch) -> None:
    from app import config
    from app.main import app

    monkeypatch.setattr(config, "MOCK_MODE", False)
    response = TestClient(app, raise_server_exceptions=False).post(
        "/api/sources", json={"name": "missing-text.txt"}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


def test_invalid_pasted_source_json_returns_422(monkeypatch) -> None:
    from app import config
    from app.main import app

    monkeypatch.setattr(config, "MOCK_MODE", False)
    response = TestClient(app, raise_server_exceptions=False).post(
        "/api/sources", content=b'{"text":', headers={"content-type": "application/json"}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


@pytest.mark.asyncio
async def test_verified_evidence_returns_exact_original_source_slice(monkeypatch) -> None:
    source_text = 'The policy says “30 days” for refunds.\n'
    source = Source(source_id="s1", name="policy.txt", pages=[Page(page=1, text=source_text)])
    claim = Claim(claim_id="c1", text="Refunds take 30 days.")

    async def verdict_with_straight_quotes(*args, **kwargs):
        return verdict_module._VerdictOutput(
            verdict="supported",
            passage_id="p1",
            quote='The policy says "30 days" for refunds.',
            explanation="The source supports the claim.",
        )

    monkeypatch.setattr(verdict_module, "_call_verdict_llm", verdict_with_straight_quotes)
    result = await evaluate_claim(
        claim=claim,
        chunks=[{"source_id": "s1", "source_name": source.name, "page": 1, "text": source_text}],
        sources_by_id={"s1": source},
        retrieval_score=0.8,
        client=MagicMock(),
        model="test-model",
    )

    evidence = result.evidence[0]
    assert evidence.page == 1
    assert evidence.quote == source.pages[0].text[evidence.start : evidence.end]
    assert evidence.quote == "The policy says “30 days” for refunds."


def _source_with_bm25_term() -> Source:
    return Source(
        source_id="s1",
        name="policy.txt",
        # Five chunks ensure BM25 has a meaningful document-frequency signal:
        # the query term occurs only in the final chunk.
        pages=[Page(page=1, text=" ".join(["common"] * 700 + ["rareterm"] * 100))],
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("side_effect", [Exception("document embeddings unavailable"), ValueError("invalid dimensions")])
async def test_document_embedding_failure_uses_bm25_without_zero_score(side_effect) -> None:
    client = MagicMock()
    client.models.embed_content.side_effect = side_effect

    index = await RetrievalIndex.build([_source_with_bm25_term()], client, "embedding-model")
    chunks, score = await index.retrieve("rareterm", client, "embedding-model")

    assert chunks
    assert score == 1.0


@pytest.mark.asyncio
async def test_query_embedding_failure_uses_bm25_without_zero_score() -> None:
    client = MagicMock()
    client.models.embed_content.side_effect = [
        SimpleNamespace(embeddings=[SimpleNamespace(values=[1.0, 0.0]) for _ in range(5)]),
        Exception("query embeddings unavailable"),
    ]

    index = await RetrievalIndex.build([_source_with_bm25_term()], client, "embedding-model")
    chunks, score = await index.retrieve("rareterm", client, "embedding-model")

    assert chunks
    assert score == 1.0


@pytest.mark.asyncio
async def test_invalid_embedding_dimension_uses_bm25_without_zero_score() -> None:
    client = MagicMock()
    client.models.embed_content.side_effect = [
        SimpleNamespace(embeddings=[SimpleNamespace(values=[1.0, 0.0]) for _ in range(5)]),
        SimpleNamespace(embeddings=[SimpleNamespace(values=[1.0, 0.0, 0.0])]),
    ]

    index = await RetrievalIndex.build([_source_with_bm25_term()], client, "embedding-model")
    chunks, score = await index.retrieve("rareterm", client, "embedding-model")

    assert chunks
    assert score == 1.0


@pytest.mark.asyncio
async def test_no_retrieval_signal_is_explicit_when_bm25_has_no_match() -> None:
    client = MagicMock()
    client.models.embed_content.side_effect = Exception("embeddings unavailable")

    index = await RetrievalIndex.build([_source_with_bm25_term()], client, "embedding-model")
    chunks, score = await index.retrieve("absentterm", client, "embedding-model")

    assert chunks == []
    assert score is None
