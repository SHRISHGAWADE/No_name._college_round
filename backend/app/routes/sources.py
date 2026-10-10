"""POST /api/sources — upload and extract source documents (P2 owns this file).

Handles:
  • multipart/form-data: files[] (PDF or TXT)
  • application/json:    {"name": "...", "text": "..."}  (pasted text)

v1.1 limits (env-configurable):
  • MAX_FILE_BYTES  (default 10 MB)
  • MAX_PAGES       (default 50)
  • MAX_FILES_PER_REQUEST (default 5)
"""
import asyncio
import json
import logging
import pathlib
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, ValidationError

from app import config
from app.models import Page, Source, SourcesResponse
from app.pipeline.sources import extract_pages
from app.rate_limit import limiter
from app.store import store
from app.validation.text import normalize_text
from app.auth import current_user_id

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sources", tags=["sources"])


class _PastedText(BaseModel):
    name: str = "pasted_source.txt"
    text: str


@router.post("", response_model=SourcesResponse)
@limiter.limit(config.RATE_LIMIT)
async def upload_sources(
    request: Request,
    files: Optional[List[UploadFile]] = File(None, alias="files[]"),
    files_compat: Optional[List[UploadFile]] = File(None, alias="files"),
    owner_id: str = Depends(current_user_id),
) -> SourcesResponse:
    content_type = request.headers.get("content-type", "")
    request_id: str = getattr(request.state, "request_id", "-")

    if config.MOCK_MODE:
        # Preserve the real upload → audit flow while providing the canonical
        # two-page demo source to frontend work in mock mode.
        await asyncio.sleep(0.25)
        root = pathlib.Path(__file__).resolve().parents[3]
        mock_path = next(
            (path for path in (root / "mock" / "sources.json", root / "docs" / "mock" / "sources.json") if path.exists()),
            None,
        )
        if mock_path is None:
            raise HTTPException(
                status_code=500,
                detail={"error": {"code": "mock_data_missing", "message": "Demo source data is unavailable."}},
            )
        payload = json.loads(mock_path.read_text(encoding="utf-8"))
        sources = [Source(**item) for item in payload.get("sources", [])]
        if not sources:
            raise HTTPException(
                status_code=500,
                detail={"error": {"code": "mock_data_missing", "message": "Demo source data is unavailable."}},
            )
        for source in sources:
            store.set_source(source.source_id, source, owner_id)
        return SourcesResponse(sources=sources)

    # ── JSON body (pasted text) ────────────────────────────────────────────
    if "application/json" in content_type:
        try:
            body = await request.json()
            payload = _PastedText(**body)
        except (json.JSONDecodeError, ValidationError):
            raise HTTPException(
                status_code=422,
                detail={"error": {
                    "code": "invalid_request",
                    "message": "Provide JSON with a non-empty text field for the pasted source.",
                }},
            )
        text = normalize_text(payload.text)
        if not text.strip():
            raise HTTPException(
                status_code=422,
                detail={"error": {"code": "empty_text", "message": "Source text cannot be empty."}},
            )
        src = _make_text_source(payload.name, text)
        store.set_source(src.source_id, src, owner_id)
        return SourcesResponse(sources=[src])

    # ── Multipart files ────────────────────────────────────────────────────
    files = files or files_compat
    if not files:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "no_input", "message": "Provide files or a JSON body with text."}},
        )

    if len(files) > config.MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=422,
            detail={"error": {
                "code": "too_many_files",
                "message": f"Maximum {config.MAX_FILES_PER_REQUEST} files per request.",
            }},
        )

    sources: List[Source] = []
    for upload in files:
        content = await upload.read()
        filename = upload.filename or "upload.txt"
        log.info("source_upload request_id=%s size=%d", request_id, len(content))

        if len(content) > config.MAX_FILE_BYTES:
            raise HTTPException(
                status_code=413,
                detail={"error": {
                    "code": "file_too_large",
                    "message": f"File '{filename}' exceeds {config.MAX_FILE_BYTES // 1024 // 1024} MB limit.",
                }},
            )

        if not filename.lower().endswith((".pdf", ".txt")):
            raise HTTPException(
                status_code=422,
                detail={"error": {"code": "unsupported_file_type", "message": "Upload a PDF or TXT file."}},
            )

        try:
            pages = extract_pages(filename, content)
        except ValueError as exc:
            code = str(exc)
            raise HTTPException(
                status_code=422,
                detail={"error": {
                    "code": code,
                    "message": "This PDF has no readable text layer. Scanned PDFs are not supported.",
                }},
            )
        except Exception as exc:
            log.warning("source extraction failed request_id=%s type=%s", request_id, type(exc).__name__)
            raise HTTPException(
                status_code=422,
                detail={"error": {"code": "extraction_error", "message": "The source could not be read. Check the file and try again."}},
            )

        if len(pages) > config.MAX_PAGES:
            raise HTTPException(
                status_code=422,
                detail={"error": {
                    "code": "too_many_pages",
                    "message": f"Document has {len(pages)} pages; maximum is {config.MAX_PAGES}.",
                }},
            )

        source_id = f"s_{uuid.uuid4().hex}"
        src = Source(source_id=source_id, name=filename, pages=pages)
        pdf_bytes = content if filename.lower().endswith(".pdf") else None
        store.set_source(source_id, src, owner_id, pdf_bytes, "application/pdf" if pdf_bytes else "text/plain")
        sources.append(src)
        log.info("source_stored source_id=%s pages=%d request_id=%s", source_id, len(pages), request_id)

    return SourcesResponse(sources=sources)


def _make_text_source(name: str, text: str) -> Source:
    source_id = f"s_{uuid.uuid4().hex}"
    return Source(
        source_id=source_id,
        name=name,
        pages=[Page(page=1, text=text)],
    )


@router.get("")
async def list_sources(owner_id: str = Depends(current_user_id)):
    return {"sources": store.list_sources(owner_id)}


@router.get("/{source_id}")
async def get_source(source_id: str, owner_id: str = Depends(current_user_id)):
    source = store.get_source(source_id, owner_id)
    if source is None:
        raise HTTPException(status_code=404, detail={"error": {"code": "not_found", "message": "This source was not found in your library."}})
    return source


@router.get("/{source_id}/file-url")
async def get_source_file_url(source_id: str, owner_id: str = Depends(current_user_id)):
    source = store.get_source(source_id, owner_id)
    if source is None:
        raise HTTPException(status_code=404, detail={"error": {"code": "not_found", "message": "This source was not found in your library."}})
    url = store.source_file_url(source_id, owner_id)
    if url is None:
        raise HTTPException(status_code=404, detail={"error": {"code": "file_unavailable", "message": "This source has no stored PDF file."}})
    return {"url": url, "expires_in": 300}
