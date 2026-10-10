"""Small server-side adapter for Supabase PostgREST and private file storage."""
from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

from app import config


class SupabasePersistence:
    def __init__(self) -> None:
        self.base = config.SUPABASE_URL
        self.key = config.SUPABASE_SERVICE_ROLE_KEY
        self.bucket = config.SUPABASE_STORAGE_BUCKET
        self.client = httpx.Client(timeout=20.0)

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}"}
        if extra:
            headers.update(extra)
        return headers

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = self.client.request(method, f"{self.base}{path}", headers=self._headers(kwargs.pop("headers", None)), **kwargs)
        response.raise_for_status()
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    def save_source(self, row: dict[str, Any]) -> None:
        self._request("POST", "/rest/v1/sources?on_conflict=source_id", json=row,
                      headers={"Prefer": "resolution=merge-duplicates,return=minimal"})

    def upload_pdf(self, owner_id: str, source_id: str, filename: str, content_type: str, content: bytes) -> str:
        safe_name = quote(filename.replace("\\", "/").split("/")[-1], safe=".-_")
        path = f"{owner_id}/{source_id}/{safe_name}"
        self._request("POST", f"/storage/v1/object/{self.bucket}/{path}", content=content,
                      headers={"Content-Type": content_type or "application/pdf", "x-upsert": "true"})
        return path

    def signed_pdf_url(self, path: str, expires_in: int = 300) -> str:
        result = self._request("POST", f"/storage/v1/object/sign/{self.bucket}/{quote(path, safe='/')}",
                               json={"expiresIn": expires_in})
        signed = result.get("signedURL") or result.get("signedUrl") or ""
        if signed.startswith("/"):
            return f"{self.base}/storage/v1{signed}" if not signed.startswith("/storage/v1") else f"{self.base}{signed}"
        return signed

    def get_source(self, source_id: str, owner_id: str) -> dict[str, Any] | None:
        rows = self._request("GET", "/rest/v1/sources", params={"source_id": f"eq.{source_id}", "owner_id": f"eq.{owner_id}", "select": "*", "limit": "1"})
        return rows[0] if rows else None

    def list_sources(self, owner_id: str) -> list[dict[str, Any]]:
        return self._request("GET", "/rest/v1/sources", params={"owner_id": f"eq.{owner_id}", "select": "source_id,name,mime_type,page_count,storage_path,created_at", "order": "created_at.desc"})

    def save_audit(self, row: dict[str, Any]) -> None:
        self._request("POST", "/rest/v1/audits?on_conflict=audit_id", json=row,
                      headers={"Prefer": "resolution=merge-duplicates,return=minimal"})

    def get_audit(self, audit_id: str, owner_id: str) -> dict[str, Any] | None:
        rows = self._request("GET", "/rest/v1/audits", params={"audit_id": f"eq.{audit_id}", "owner_id": f"eq.{owner_id}", "select": "result", "limit": "1"})
        return rows[0]["result"] if rows else None

    def list_audits(self, owner_id: str, limit: int = 100) -> list[dict[str, Any]]:
        rows = self._request("GET", "/rest/v1/audits", params={"owner_id": f"eq.{owner_id}", "select": "audit_id,created_at,status,result", "order": "created_at.desc", "limit": str(limit)})
        return rows

    def save_source_chunks(self, owner_id: str, source_id: str, chunks: list[dict[str, Any]], vectors: list[list[float]], model: str) -> None:
        rows = []
        for index, (chunk, vector) in enumerate(zip(chunks, vectors)):
            vector_text = "[" + ",".join(format(float(value), ".8g") for value in vector) + "]"
            rows.append({"owner_id": owner_id, "source_id": source_id, "chunk_index": index,
                         "page_number": chunk["page"], "char_start": chunk["char_start"],
                         "content": chunk["text"], "embedding": vector_text, "embedding_model": model})
        if rows:
            self._request("POST", "/rest/v1/source_chunks?on_conflict=source_id,embedding_model,chunk_index", json=rows,
                          headers={"Prefer": "resolution=merge-duplicates,return=minimal"})

    def get_source_chunks(self, owner_id: str, source_id: str, model: str) -> list[dict[str, Any]]:
        return self._request("GET", "/rest/v1/source_chunks", params={
            "owner_id": f"eq.{owner_id}", "source_id": f"eq.{source_id}",
            "embedding_model": f"eq.{model}", "select": "chunk_index,page_number,char_start,content,embedding",
            "order": "chunk_index.asc",
        })


persistence = SupabasePersistence() if config.SUPABASE_ENABLED else None
