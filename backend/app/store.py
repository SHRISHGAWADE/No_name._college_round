"""In-memory AuditStore with a Redis-compatible interface.

All routes use only this interface; Redis can be a drop-in after CP3
without touching route or pipeline code.
"""
from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.models import AuditResult, Source

log = logging.getLogger(__name__)


class AuditStore:
    """Thread-safe, asyncio-friendly in-memory store."""

    def __init__(self) -> None:
        self._audits: Dict[str, AuditResult] = {}
        self._sources: Dict[str, Source] = {}
        self._source_created: Dict[str, datetime] = {}
        # SSE event queues keyed by audit_id
        self._queues: Dict[str, asyncio.Queue] = {}
        self._lock = threading.Lock()

    # ── Sources ───────────────────────────────────────────────────────────

    def set_source(self, source_id: str, source: Source) -> None:
        with self._lock:
            self._sources[source_id] = source
            self._source_created[source_id] = datetime.now(timezone.utc)
        log.info("stored source source_id=%s pages=%d", source_id, len(source.pages))

    def get_source(self, source_id: str) -> Optional[Source]:
        return self._sources.get(source_id)

    def get_sources(self, source_ids: List[str]) -> List[Source]:
        return [self._sources[sid] for sid in source_ids if sid in self._sources]

    def clear(self) -> None:
        """Clear ephemeral records; useful for isolated tests and local resets."""
        with self._lock:
            self._audits.clear()
            self._sources.clear()
            self._source_created.clear()
            self._queues.clear()

    # ── Audits ────────────────────────────────────────────────────────────

    def set_audit(self, audit_id: str, result: AuditResult) -> None:
        with self._lock:
            self._audits[audit_id] = result

    def get_audit(self, audit_id: str) -> Optional[AuditResult]:
        return self._audits.get(audit_id)

    # ── SSE event queues ──────────────────────────────────────────────────

    def get_or_create_queue(self, audit_id: str) -> asyncio.Queue:
        with self._lock:
            if audit_id not in self._queues:
                self._queues[audit_id] = asyncio.Queue()
        return self._queues[audit_id]

    async def push_event(self, audit_id: str, event: str, data: Any) -> None:
        q = self.get_or_create_queue(audit_id)
        await q.put({"event": event, "data": data})

    # ── Retention (privacy: auto-delete after RETENTION_MIN) ─────────────

    def purge_old(self, retention_minutes: int) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=retention_minutes)
        to_delete: List[str] = []
        with self._lock:
            for aid, result in self._audits.items():
                try:
                    created = datetime.fromisoformat(result.created_at.replace("Z", "+00:00"))
                    if created < cutoff:
                        to_delete.append(aid)
                except Exception:
                    pass
        for aid in to_delete:
            with self._lock:
                self._audits.pop(aid, None)
                self._queues.pop(aid, None)
            log.info("purged audit audit_id=%s (retention)", aid)
        with self._lock:
            expired_sources = [sid for sid, created in self._source_created.items() if created < cutoff]
            for sid in expired_sources:
                self._sources.pop(sid, None)
                self._source_created.pop(sid, None)
    def clear(self) -> None:
        """Clear all stored audits, sources, and queues."""
        with self._lock:
            self._audits.clear()
            self._sources.clear()
            self._source_created.clear()
            self._queues.clear()


# Module-level singleton — all routes import this.
store = AuditStore()
