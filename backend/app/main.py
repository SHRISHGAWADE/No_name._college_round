"""FastAPI application entry point (P1 owns this file).

Responsibilities:
  • CORS (allow *.vercel.app and localhost)
  • X-Request-ID middleware (v1.1)
  • Structured JSON logging
  • Rate limiting (slowapi, v1.1)
  • /health, /api/mock/sources, /api/mock/audit
  • Route registration: sources, audit
  • Background retention job
"""
from __future__ import annotations

import asyncio
import json
import logging
import logging.config
import os
import pathlib
import uuid
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app import config
from app.rate_limit import limiter
from app.routes.sources import router as sources_router
from app.routes.audit import router as audit_router

# ── Logging ───────────────────────────────────────────────────────────────
logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "logging.Formatter",
            "fmt": '{"time":"%(asctime)s","level":"%(levelname)s","name":"%(name)s","message":"%(message)s"}',
            "datefmt": "%Y-%m-%dT%H:%M:%S",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        }
    },
    "root": {"level": "INFO", "handlers": ["console"]},
})
log = logging.getLogger(__name__)

from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("second_opinion_start version=1.1 mock=%s", config.MOCK_MODE)
    if not config.GEMINI_API_KEY and not config.MOCK_MODE:
        log.warning("GEMINI_API_KEY is not set — real audits will fail")
    retention_task = asyncio.create_task(_retention_loop())
    yield
    retention_task.cancel()


# ── App ───────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Second Opinion",
    version="1.1",
    description="Evidence-first AI answer auditor.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_error_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"error": {"code": "rate_limited", "message": "Too many requests. Please wait a moment and try again."}},
    )


@app.exception_handler(HTTPException)
async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    if not isinstance(detail, dict) or "error" not in detail:
        detail = {"error": {"code": "http_error", "message": str(detail)}}
    return JSONResponse(status_code=exc.status_code, content=detail, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "invalid_request", "message": "The request body or form data is invalid."}},
    )

# CORS: allow Vercel preview URLs and localhost
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://[a-z0-9\-]+\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


# ── Request-ID middleware (v1.1) ──────────────────────────────────────────
@app.middleware("http")
async def request_id_middleware(request: Request, call_next) -> Response:
    rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = rid
    response: Response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response


# ── Routes ────────────────────────────────────────────────────────────────
app.include_router(sources_router)
app.include_router(audit_router)


# ── Health ────────────────────────────────────────────────────────────────
@app.get("/health", tags=["meta"])
def health():
    return {"ok": True, "version": "1.1"}


# ── Mock endpoints (always available) ────────────────────────────────────
def _load_mock_file(filename: str) -> Any:
    base = pathlib.Path(__file__).parent.parent.parent
    candidates = [
        base / "mock" / filename,
        base / "docs" / "mock" / filename,
    ]
    for p in candidates:
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    log.warning("mock file not found: %s", filename)
    return {}


@app.get("/api/mock/sources", tags=["mock"])
def mock_sources():
    payload = _load_mock_file("sources.json")
    from app.models import Source
    from app.store import store
    for item in payload.get("sources", []):
        source = Source(**item)
        store.set_source(source.source_id, source)
    return payload


@app.get("/api/mock/audit", tags=["mock"])
def mock_audit():
    return _load_mock_file("audit.json")


# ── Background retention loop ─────────────────────────────────────────────
async def _retention_loop() -> None:
    from app.store import store as _store
    while True:
        await asyncio.sleep(60)  # check every minute
        try:
            _store.purge_old(config.RETENTION_MIN)
        except Exception as exc:
            log.warning("retention purge error: %s", exc)
