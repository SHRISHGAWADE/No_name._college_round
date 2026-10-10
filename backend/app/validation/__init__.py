"""validation package – P2 owns this entire directory."""
from app.validation.text import normalize_text
from app.validation.spans import locate_span
from app.validation.quotes import verify_quote, QuoteMatch

__all__ = ["normalize_text", "locate_span", "verify_quote", "QuoteMatch"]
