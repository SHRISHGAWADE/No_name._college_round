"""Hybrid retrieval: BM25 + dense embeddings via reciprocal rank fusion (P1).

Steps per audit initialisation:
  1. chunk_source() splits each source into 150-250 word overlapping chunks.
  2. embed_chunks() calls Gemini embedding API once per source (document task type).
  3. Per claim:
     a. dense_retrieve()  – cosine similarity against stored vectors
     b. bm25_retrieve()   – BM25 over the same chunks
     c. reciprocal_rank_fusion() – merge, return top-k
  4. best retrieval score stored in signals.retrieval_score.
  5. If best score < RETRIEVAL_LOW_THRESHOLD: flag "low_retrieval".
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from rank_bm25 import BM25Okapi

from app.models import Source
from app.pipeline.sources import chunk_source

log = logging.getLogger(__name__)

RETRIEVAL_LOW_THRESHOLD = 0.35


# ── Embedding helper ──────────────────────────────────────────────────────

async def embed_texts(texts: List[str], client, model: str, task_type: str = "RETRIEVAL_DOCUMENT") -> np.ndarray:
    """Return (N, D) float32 embedding matrix."""
    if not texts:
        return np.zeros((0, 1), dtype=np.float32)

    try:
        response = await asyncio.to_thread(
            client.models.embed_content,
            model=model,
            contents=texts,
            config={"task_type": task_type},
        )
        vecs = [np.array(e.values, dtype=np.float32) for e in response.embeddings]
        return np.stack(vecs)
    except Exception as exc:
        log.warning("embed_texts failed (%s): %s", task_type, exc)
        # Return zeros — retrieval will fall back to BM25 only
        dim = 768
        return np.zeros((len(texts), dim), dtype=np.float32)


def _cosine_sim(query_vec: np.ndarray, doc_matrix: np.ndarray) -> np.ndarray:
    """Return cosine similarities between query_vec and each row of doc_matrix."""
    if doc_matrix.shape[0] == 0:
        return np.array([])
    qn = query_vec / (np.linalg.norm(query_vec) + 1e-10)
    dns = doc_matrix / (np.linalg.norm(doc_matrix, axis=1, keepdims=True) + 1e-10)
    return (dns @ qn).astype(float)


def _reciprocal_rank_fusion(
    *ranked_lists: List[int], k: int = 60
) -> List[Tuple[int, float]]:
    """Merge ranked index lists using RRF; return sorted (idx, score) list."""
    scores: Dict[int, float] = {}
    for ranked in ranked_lists:
        for rank, idx in enumerate(ranked):
            scores[idx] = scores.get(idx, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)


# ── Retrieval index per audit ─────────────────────────────────────────────

class RetrievalIndex:
    """Built once per audit from uploaded sources; reused for all claims."""

    def __init__(
        self,
        sources: List[Source],
        embeddings: np.ndarray,
        chunks: List[Dict[str, Any]],
        bm25: BM25Okapi,
    ) -> None:
        self.sources = sources
        self.embeddings = embeddings
        self.chunks = chunks
        self.bm25 = bm25

    @classmethod
    async def build(cls, sources: List[Source], client, embedding_model: str) -> "RetrievalIndex":
        """Chunk all sources, embed once, build BM25 index."""
        all_chunks: List[Dict[str, Any]] = []
        for src in sources:
            for chunk in chunk_source(src.pages):
                chunk["source_id"] = src.source_id
                chunk["source_name"] = src.name
                all_chunks.append(chunk)

        texts = [c["text"] for c in all_chunks]
        embeddings = await embed_texts(texts, client, embedding_model, task_type="RETRIEVAL_DOCUMENT")

        # BM25 expects tokenised input
        tokenised = [t.lower().split() for t in texts]
        bm25 = BM25Okapi(tokenised) if tokenised else BM25Okapi([[]])

        return cls(sources=sources, embeddings=embeddings, chunks=all_chunks, bm25=bm25)

    async def retrieve(
        self, claim_text: str, client, embedding_model: str, top_k: int = 4
    ) -> Tuple[List[Dict[str, Any]], float]:
        """Return (top_k chunks, best_retrieval_score)."""
        if not self.chunks:
            return [], 0.0

        # Dense retrieval
        query_emb_matrix = await embed_texts([claim_text], client, embedding_model, task_type="RETRIEVAL_QUERY")
        if query_emb_matrix.shape[1] == self.embeddings.shape[1]:
            dense_scores = _cosine_sim(query_emb_matrix[0], self.embeddings)
        else:
            # A transient embedding failure or model dimension change must not
            # break BM25 retrieval; dense rankings become neutral.
            dense_scores = np.zeros(len(self.chunks), dtype=np.float32)
        dense_ranked = list(np.argsort(dense_scores)[::-1])

        # BM25
        bm25_scores = self.bm25.get_scores(claim_text.lower().split())
        bm25_ranked = list(np.argsort(bm25_scores)[::-1])

        # RRF
        fused = _reciprocal_rank_fusion(dense_ranked, bm25_ranked)
        top_indices = [idx for idx, _ in fused[:top_k]]

        best_score = float(dense_scores[top_indices[0]]) if top_indices and len(dense_scores) > 0 else 0.0

        result_chunks = [self.chunks[i] for i in top_indices if i < len(self.chunks)]
        return result_chunks, best_score
