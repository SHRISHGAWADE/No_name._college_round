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
from app.store import store

log = logging.getLogger(__name__)

RETRIEVAL_LOW_THRESHOLD = 0.35


# ── Embedding helper ──────────────────────────────────────────────────────

async def embed_texts(
    texts: List[str], client, model: str, task_type: str = "RETRIEVAL_DOCUMENT"
) -> Optional[np.ndarray]:
    """Return a valid (N, D) embedding matrix, or ``None`` on failure.

    ``None`` is deliberately distinct from a zero vector: an all-zero vector
    has an arbitrary rank after ``argsort`` and would make a BM25-only result
    look like a low-scoring dense result.
    """
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
        matrix = np.stack(vecs)
        if matrix.ndim != 2 or matrix.shape[0] != len(texts) or matrix.shape[1] == 0:
            raise ValueError("embedding response has an invalid shape")
        return matrix
    except Exception as exc:
        log.warning("embed_texts failed (%s): %s", task_type, exc)
        return None


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
        embeddings: Optional[np.ndarray],
        chunks: List[Dict[str, Any]],
        bm25: BM25Okapi,
    ) -> None:
        self.sources = sources
        self.embeddings = embeddings
        self.chunks = chunks
        self.bm25 = bm25

    @classmethod
    async def build(cls, sources: List[Source], client, embedding_model: str) -> "RetrievalIndex":
        """Reuse account-owned document chunks/vectors when available."""
        all_chunks: List[Dict[str, Any]] = []
        cached_vectors: List[List[float]] = []
        all_cached = bool(sources)
        for src in sources:
            cached = store.get_cached_source_chunks(src.source_id, embedding_model)
            if not cached:
                all_cached = False
                break
            for chunk in cached:
                cached_vectors.append(chunk.pop("embedding"))
                chunk["source_id"] = src.source_id
                chunk["source_name"] = src.name
                all_chunks.append(chunk)

        embeddings: Optional[np.ndarray] = None
        if all_cached:
            try:
                embeddings = np.asarray(cached_vectors, dtype=np.float32)
                if embeddings.ndim != 2 or embeddings.shape[0] != len(all_chunks):
                    raise ValueError("cached embedding shape mismatch")
                log.info("retrieval_embeddings_reused sources=%d chunks=%d", len(sources), len(all_chunks))
            except (TypeError, ValueError):
                all_cached = False

        if not all_cached:
            all_chunks = []
            by_source: Dict[str, List[Dict[str, Any]]] = {}
            for src in sources:
                source_chunks = chunk_source(src.pages)
                for chunk in source_chunks:
                    chunk["source_id"] = src.source_id
                    chunk["source_name"] = src.name
                    all_chunks.append(chunk)
                by_source[src.source_id] = source_chunks
            texts = [c["text"] for c in all_chunks]
            embeddings = await embed_texts(texts, client, embedding_model, task_type="RETRIEVAL_DOCUMENT")
            if embeddings is not None:
                offset = 0
                for src in sources:
                    chunks = by_source[src.source_id]
                    vectors = embeddings[offset:offset + len(chunks)].tolist()
                    store.save_source_chunks(src.source_id, chunks, vectors, embedding_model)
                    offset += len(chunks)

        # BM25 expects tokenised input
        texts = [chunk["text"] for chunk in all_chunks]
        tokenised = [t.lower().split() for t in texts]
        bm25 = BM25Okapi(tokenised) if tokenised else BM25Okapi([[]])

        return cls(sources=sources, embeddings=embeddings, chunks=all_chunks, bm25=bm25)

    async def retrieve(
        self, claim_text: str, client, embedding_model: str, top_k: int = 4
    ) -> Tuple[List[Dict[str, Any]], Optional[float]]:
        """Return selected chunks and a score for the retrieval method used.

        A score of ``None`` means neither dense similarity nor BM25 supplied a
        meaningful relevance score.  This is represented as ``null`` in the
        existing optional contract field rather than fabricated as zero.
        """
        if not self.chunks:
            return [], 0.0

        # Dense retrieval
        query_emb_matrix = await embed_texts([claim_text], client, embedding_model, task_type="RETRIEVAL_QUERY")
        dense_available = (
            self.embeddings is not None
            and query_emb_matrix is not None
            and query_emb_matrix.shape == (1, self.embeddings.shape[1])
        )
        if dense_available:
            dense_scores = _cosine_sim(query_emb_matrix[0], self.embeddings)
            dense_ranked = list(np.argsort(dense_scores)[::-1])
        else:
            dense_scores = None
            dense_ranked = []

        # BM25
        query_tokens = set(claim_text.lower().split())
        bm25_scores = self.bm25.get_scores(list(query_tokens))
        bm25_max = float(np.max(bm25_scores)) if len(bm25_scores) else 0.0
        if bm25_max > 0:
            bm25_ranked = list(np.argsort(bm25_scores)[::-1])
        else:
            # BM25's IDF is zero for a one-document corpus.  Preserve a
            # deterministic lexical fallback for that valid small-source case
            # instead of relying on all-zero vector tie ordering.
            lexical_scores = np.array([
                len(query_tokens.intersection(chunk["text"].lower().split())) / len(query_tokens)
                if query_tokens else 0.0
                for chunk in self.chunks
            ])
            lexical_max = float(np.max(lexical_scores)) if len(lexical_scores) else 0.0
            if lexical_max > 0:
                bm25_scores = lexical_scores
                bm25_max = lexical_max
                bm25_ranked = list(np.argsort(lexical_scores)[::-1])
            else:
                bm25_ranked = []

        # RRF
        fused = _reciprocal_rank_fusion(dense_ranked, bm25_ranked)
        top_indices = [idx for idx, _ in fused[:top_k]]

        if not top_indices:
            return [], None

        if dense_scores is not None:
            best_score: Optional[float] = float(dense_scores[top_indices[0]])
        elif bm25_max > 0:
            # BM25 has no fixed score range.  Report the selected passage's
            # score relative to this query's best BM25 result, preserving the
            # existing 0..1 signal convention without calling it cosine.
            best_score = float(bm25_scores[top_indices[0]] / bm25_max)
        else:
            best_score = None

        result_chunks = [self.chunks[i] for i in top_indices if i < len(self.chunks)]
        return result_chunks, best_score
