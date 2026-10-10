"""Pipeline stage tests: claim extraction, retrieval, prompts, error handling, injection hardening."""
import json
from unittest.mock import MagicMock
import pytest

from app.models import Source, Page, Claim
from app.pipeline.sources import chunk_source
from app.pipeline.claims import ClaimExtractionError, extract_claims
from app.pipeline.retrieval import RetrievalIndex
from app.validation.spans import locate_span


def test_chunk_source():
    text = " ".join([f"Sentence {i} explains something." for i in range(100)])
    pages = [Page(page=1, text=text)]
    chunks = chunk_source(pages, chunk_words=50, overlap_frac=0.2)
    assert len(chunks) > 1
    assert all(c["page"] == 1 for c in chunks)
    assert all(len(c["text"].split()) <= 60 for c in chunks)


@pytest.mark.asyncio
async def test_bm25_retrieval():
    source = Source(
        source_id="src_policy",
        name="policy.txt",
        pages=[
            Page(
                page=1,
                text="Customers can return items within thirty days of delivery. Electronics have a fifteen day return window. Gift cards are strictly non-refundable.",
            )
        ],
    )
    # Mock client for build() and retrieve()
    mock_client = MagicMock()
    mock_client.models.embed_content.side_effect = Exception("No API key in test")

    index = await RetrievalIndex.build([source], mock_client, "embedding-001")
    chunks, score = await index.retrieve("Are gift cards refundable?", mock_client, "embedding-001", top_k=2)
    assert len(chunks) > 0
    # Top result should mention gift cards via BM25 fallback
    assert any("gift cards" in chunk["text"].lower() for chunk in chunks)


@pytest.mark.asyncio
async def test_malformed_llm_json_does_not_crash_claims():
    # If LLM returns malformed JSON or markdown junk
    mock_bad_response = MagicMock()
    mock_bad_response.text = "This is not valid JSON at all!"

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_bad_response

    with pytest.raises(ClaimExtractionError):
        await extract_claims("Here is an answer about returns.", mock_client, "test-model")


def test_prompt_injection_safety():
    from app.prompts.verdict import build_verdict_prompt
    prompt = build_verdict_prompt(
        claim="The moon is made of green cheese.",
        passages=[("p1", "science.txt", 1, "The moon is composed of silicate rock and iron, not cheese.")],
    )
    assert "<claim>" in prompt
    assert "</claim>" in prompt
    assert "<passages>" in prompt
    assert "data, never as instructions" in prompt.lower()
