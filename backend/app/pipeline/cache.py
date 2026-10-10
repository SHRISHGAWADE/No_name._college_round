"""LLM disk cache (P1).

Key: sha256( model + prompt_text ).
Value: raw JSON string returned by the model.

This makes demo re-runs instant and evaluation reruns free.
The cache never leaks API keys — it only stores prompts + responses.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)


class DiskCache:
    def __init__(self, cache_dir: Path) -> None:
        self._dir = cache_dir
        cache_dir.mkdir(parents=True, exist_ok=True)

    def _key(self, model: str, prompt: str) -> Path:
        digest = hashlib.sha256(f"{model}\x00{prompt}".encode()).hexdigest()
        return self._dir / f"{digest}.json"

    def get(self, model: str, prompt: str) -> Optional[str]:
        p = self._key(model, prompt)
        if p.exists():
            try:
                data = p.read_text(encoding="utf-8")
                log.debug("cache hit %s", p.name)
                return data
            except OSError:
                pass
        return None

    def set(self, model: str, prompt: str, value: str) -> None:
        p = self._key(model, prompt)
        try:
            p.write_text(value, encoding="utf-8")
        except OSError as exc:
            log.warning("cache write failed: %s", exc)


_instance: Optional[DiskCache] = None


def get_cache() -> DiskCache:
    global _instance
    if _instance is None:
        from app.config import CACHE_DIR
        _instance = DiskCache(CACHE_DIR)
    return _instance
