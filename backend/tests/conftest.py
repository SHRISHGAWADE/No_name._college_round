from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

# The API flow tests exercise the same routes with deterministic canned data.
os.environ.setdefault("MOCK", "1")
os.environ.setdefault("RATE_LIMIT_DISABLED", "1")
