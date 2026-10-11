"""Temporary in-memory audit/source store for the no-login demo."""
from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.models import AuditResult, Source

log = logging.getLogger(__name__)


class AuditStore:
    """Keep demo records in this backend process; nothing is persisted."""

    def __init__(self) -> None:
        self._audits: Dict[str, AuditResult] = {}
        self._sources: Dict[str, Source] = {}
        self._source_created: Dict[str, datetime] = {}
        self._queues: Dict[str, asyncio.Queue] = {}
        self._audit_owners: Dict[str, str] = {}
        self._source_owners: Dict[str, str] = {}
        self._lock = threading.Lock()

    def set_source(self, source_id: str, source: Source, owner_id: str = "local-user", file_bytes: bytes | None = None, mime_type: str = "") -> None:
        with self._lock:
            self._sources[source_id] = source
            self._source_created[source_id] = datetime.now(timezone.utc)
            self._source_owners[source_id] = owner_id
        log.info("stored source source_id=%s pages=%d", source_id, len(source.pages))

    def get_source(self, source_id: str, owner_id: str | None = None) -> Optional[Source]:
        source = self._sources.get(source_id)
        if source is None:
            return None
        if owner_id is None or self._source_owners.get(source_id, "local-user") == owner_id:
            return source
        return None

    def get_sources(self, source_ids: List[str], owner_id: str | None = None) -> List[Source]:
        return [src for sid in source_ids if (src := self.get_source(sid, owner_id)) is not None]

    def list_sources(self, owner_id: str) -> List[dict[str, Any]]:
        return [
            {"source_id": sid, "name": src.name, "mime_type": "text/plain", "page_count": len(src.pages),
             "created_at": self._source_created[sid].isoformat(), "storage_path": None}
            for sid, src in self._sources.items() if self._source_owners.get(sid, "local-user") == owner_id
        ]

    def source_file_url(self, source_id: str, owner_id: str) -> Optional[str]:
        return None

    def source_owner(self, source_id: str) -> str:
        return self._source_owners.get(source_id, "local-user")

    def get_cached_source_chunks(self, source_id: str, embedding_model: str) -> List[dict[str, Any]]:
        return []

    def save_source_chunks(self, source_id: str, chunks: List[dict[str, Any]], vectors: List[List[float]], embedding_model: str) -> None:
        return None

    def set_audit(self, audit_id: str, result: AuditResult, owner_id: str | None = None) -> None:
        resolved_owner = owner_id or self._audit_owners.get(audit_id, "local-user")
        with self._lock:
            self._audits[audit_id] = result
            self._audit_owners[audit_id] = resolved_owner

    def get_audit(self, audit_id: str, owner_id: str | None = None) -> Optional[AuditResult]:
        result = self._audits.get(audit_id)
        if result is None:
            return None
        if owner_id is None or self._audit_owners.get(audit_id, "local-user") == owner_id:
            return result
        return None

    def list_audits(self, owner_id: str) -> List[dict[str, Any]]:
        return [
            {"audit_id": aid, "created_at": result.created_at, "status": result.status,
             "result": result.model_dump(mode="json")}
            for aid, result in self._audits.items() if self._audit_owners.get(aid, "local-user") == owner_id
        ]

    def get_or_create_queue(self, audit_id: str) -> asyncio.Queue:
        with self._lock:
            if audit_id not in self._queues:
                self._queues[audit_id] = asyncio.Queue()
            return self._queues[audit_id]

    async def push_event(self, audit_id: str, event: str, data: Any) -> None:
        await self.get_or_create_queue(audit_id).put({"event": event, "data": data})

    def purge_old(self, retention_minutes: int) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=retention_minutes)
        with self._lock:
            expired_audits = []
            for audit_id, result in self._audits.items():
                try:
                    created = datetime.fromisoformat(result.created_at.replace("Z", "+00:00"))
                    if created < cutoff:
                        expired_audits.append(audit_id)
                except Exception:
                    continue
            for audit_id in expired_audits:
                self._audits.pop(audit_id, None)
                self._audit_owners.pop(audit_id, None)
                self._queues.pop(audit_id, None)
            expired_sources = [sid for sid, created in self._source_created.items() if created < cutoff]
            for source_id in expired_sources:
                self._sources.pop(source_id, None)
                self._source_created.pop(source_id, None)
                self._source_owners.pop(source_id, None)

    def clear(self) -> None:
        with self._lock:
            self._audits.clear()
            self._sources.clear()
            self._source_created.clear()
            self._queues.clear()
            self._audit_owners.clear()
            self._source_owners.clear()


store = AuditStore()
