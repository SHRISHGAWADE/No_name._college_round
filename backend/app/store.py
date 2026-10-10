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
from app import config
from app.persistence import persistence

log = logging.getLogger(__name__)


class AuditStore:
    """Thread-safe, asyncio-friendly in-memory store."""

    def __init__(self) -> None:
        self._audits: Dict[str, AuditResult] = {}
        self._sources: Dict[str, Source] = {}
        self._source_created: Dict[str, datetime] = {}
        # SSE event queues keyed by audit_id
        self._queues: Dict[str, asyncio.Queue] = {}
        self._audit_owners: Dict[str, str] = {}
        self._source_owners: Dict[str, str] = {}
        self._source_files: Dict[str, str] = {}
        self._lock = threading.Lock()

    # ── Sources ───────────────────────────────────────────────────────────

    def set_source(self, source_id: str, source: Source, owner_id: str = "local-user", file_bytes: bytes | None = None, mime_type: str = "") -> None:
        storage_path = None
        if persistence and owner_id != "local-user" and not config.MOCK_MODE:
            if file_bytes is not None:
                storage_path = persistence.upload_pdf(owner_id, source_id, source.name, mime_type, file_bytes)
            persistence.save_source({
                "source_id": source_id, "owner_id": owner_id, "name": source.name,
                "mime_type": mime_type or "text/plain", "page_count": len(source.pages),
                "pages": [page.model_dump() for page in source.pages], "storage_path": storage_path,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        with self._lock:
            self._sources[source_id] = source
            self._source_created[source_id] = datetime.now(timezone.utc)
            self._source_owners[source_id] = owner_id
            if storage_path:
                self._source_files[source_id] = storage_path
        log.info("stored source source_id=%s pages=%d", source_id, len(source.pages))

    def get_source(self, source_id: str, owner_id: str | None = None) -> Optional[Source]:
        source = self._sources.get(source_id)
        if source is not None:
            if owner_id is None or self._source_owners.get(source_id, "local-user") == owner_id:
                return source
            return None
        if persistence and owner_id and owner_id != "local-user" and not config.MOCK_MODE:
            row = persistence.get_source(source_id, owner_id)
            if row:
                source = Source(source_id=row["source_id"], name=row["name"], pages=row.get("pages", []))
                with self._lock:
                    self._sources[source_id] = source
                    self._source_owners[source_id] = owner_id
                    if row.get("storage_path"):
                        self._source_files[source_id] = row["storage_path"]
                return source
        return None

    def get_sources(self, source_ids: List[str], owner_id: str | None = None) -> List[Source]:
        found = [src for sid in source_ids if (src := self.get_source(sid, owner_id)) is not None]
        return found

    def list_sources(self, owner_id: str) -> List[dict[str, Any]]:
        if persistence and owner_id != "local-user" and not config.MOCK_MODE:
            return persistence.list_sources(owner_id)
        return [{"source_id": sid, "name": src.name, "mime_type": "text/plain", "page_count": len(src.pages), "created_at": self._source_created[sid].isoformat(), "storage_path": None}
                for sid, src in self._sources.items() if self._source_owners.get(sid, "local-user") == owner_id]

    def source_file_url(self, source_id: str, owner_id: str) -> Optional[str]:
        if not persistence or config.MOCK_MODE or owner_id == "local-user":
            return None
        self.get_source(source_id, owner_id)
        path = self._source_files.get(source_id)
        if not path:
            row = persistence.get_source(source_id, owner_id)
            path = row.get("storage_path") if row else None
        return persistence.signed_pdf_url(path) if path else None

    def source_owner(self, source_id: str) -> str:
        return self._source_owners.get(source_id, "local-user")

    def get_cached_source_chunks(self, source_id: str, embedding_model: str) -> List[dict[str, Any]]:
        if not persistence or config.MOCK_MODE:
            return []
        owner_id = self.source_owner(source_id)
        rows = persistence.get_source_chunks(owner_id, source_id, embedding_model)
        result = []
        for row in rows:
            raw = row.get("embedding", "")
            if isinstance(raw, str) and raw.startswith("["):
                vector = [float(value) for value in raw.strip("[]").split(",") if value]
            elif isinstance(raw, list):
                vector = raw
            else:
                return []
            result.append({"page": row["page_number"], "char_start": row["char_start"], "text": row["content"], "embedding": vector})
        return result

    def save_source_chunks(self, source_id: str, chunks: List[dict[str, Any]], vectors: List[List[float]], embedding_model: str) -> None:
        owner_id = self.source_owner(source_id)
        if persistence and owner_id != "local-user" and not config.MOCK_MODE:
            persistence.save_source_chunks(self.source_owner(source_id), source_id, chunks, vectors, embedding_model)

    def clear(self) -> None:
        """Clear ephemeral records; useful for isolated tests and local resets."""
        with self._lock:
            self._audits.clear()
            self._sources.clear()
            self._source_created.clear()
            self._queues.clear()
            self._audit_owners.clear()
            self._source_owners.clear()
            self._source_files.clear()

    # ── Audits ────────────────────────────────────────────────────────────

    def set_audit(self, audit_id: str, result: AuditResult, owner_id: str | None = None) -> None:
        owner_id = owner_id or self._audit_owners.get(audit_id, "local-user")
        if persistence and owner_id != "local-user" and not config.MOCK_MODE:
            persistence.save_audit({"audit_id": audit_id, "owner_id": owner_id,
                                    "created_at": result.created_at, "status": result.status,
                                    "result": result.model_dump(mode="json")})
        with self._lock:
            self._audits[audit_id] = result
            self._audit_owners[audit_id] = owner_id

    def get_audit(self, audit_id: str, owner_id: str | None = None) -> Optional[AuditResult]:
        result = self._audits.get(audit_id)
        if result is not None:
            if owner_id is None or self._audit_owners.get(audit_id, "local-user") == owner_id:
                return result
            return None
        if persistence and owner_id and owner_id != "local-user" and not config.MOCK_MODE:
            row = persistence.get_audit(audit_id, owner_id)
            if row:
                result = AuditResult(**row)
                with self._lock:
                    self._audits[audit_id] = result
                    self._audit_owners[audit_id] = owner_id
                return result
        return None

    def list_audits(self, owner_id: str) -> List[dict[str, Any]]:
        if persistence and owner_id != "local-user" and not config.MOCK_MODE:
            return persistence.list_audits(owner_id)
        return [{"audit_id": aid, "created_at": result.created_at, "status": result.status, "result": result.model_dump(mode="json")}
                for aid, result in self._audits.items() if self._audit_owners.get(aid, "local-user") == owner_id]

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
