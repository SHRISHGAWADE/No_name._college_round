"""Runtime configuration loaded from environment variables.

All secrets are read here and exposed as typed constants.
Nothing in this module prints or logs secret values.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env if present (local dev); on deployed hosts use native env vars.
load_dotenv(Path(__file__).parent.parent / ".env", override=False)

# ── Required secret ────────────────────────────────────────────────────────
GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")

# ── Model names ────────────────────────────────────────────────────────────
GENERATION_MODEL: str = os.environ.get("GEMINI_GENERATION_MODEL", "gemini-3.8-flash")
EMBEDDING_MODEL: str = os.environ.get("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")

# ── Behaviour flags ────────────────────────────────────────────────────────
MOCK_MODE: bool = os.environ.get("MOCK", "0") == "1"
CACHE_DIR: Path = Path(os.environ.get("CACHE_DIR", ".cache"))
ENABLE_JEV: bool = os.environ.get("ENABLE_JEV", "0") == "1"
ENABLE_HHEM: bool = os.environ.get("ENABLE_HHEM", "0") == "1"

# ── Input limits (v1.1) ────────────────────────────────────────────────────
MAX_FILE_BYTES: int = int(os.environ.get("MAX_FILE_MB", "10")) * 1024 * 1024
MAX_PAGES: int = int(os.environ.get("MAX_PAGES", "50"))
MAX_ANSWER_CHARS: int = int(os.environ.get("MAX_ANSWER_CHARS", "20000"))
MAX_FILES_PER_REQUEST: int = int(os.environ.get("MAX_FILES_PER_REQUEST", "5"))
RETENTION_MIN: int = int(os.environ.get("RETENTION_MIN", "60"))
RATE_LIMIT_DISABLED: bool = os.environ.get("RATE_LIMIT_DISABLED", "0") == "1"

# Supabase persistence/auth. These values are secrets/config and are only read
# by the backend. Persistence stays disabled for local runs until configured.
SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY: str = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_STORAGE_BUCKET: str = os.environ.get("SUPABASE_STORAGE_BUCKET", "source-pdfs")
SUPABASE_CONFIGURED: bool = bool(SUPABASE_URL or SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY)
SUPABASE_ENABLED: bool = bool(SUPABASE_URL and SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY)

# ── Pipeline constants ─────────────────────────────────────────────────────
MAX_CLAIMS: int = 30
RETRIEVAL_TOP_K: int = 4
RETRIEVE_SEMAPHORE: int = 4         # asyncio concurrency cap for verdicts
VERDICT_TIMEOUT_S: float = 30.0

# ── Rate limit string used by slowapi (ignored when disabled) ──────────────
RATE_LIMIT: str = "20/minute"
