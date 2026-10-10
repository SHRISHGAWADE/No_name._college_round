"""Text normalisation — applied once at upload / answer submission.

Rules (contract §Conventions):
  • Unicode NFC
  • \\r\\n  →  \\n
  • \\r     →  \\n
"""
import unicodedata


def normalize_text(s: str) -> str:
    """Return NFC-normalised string with \\r\\n and \\r replaced by \\n."""
    if not s:
        return ""
    s = unicodedata.normalize("NFC", s)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    return s
