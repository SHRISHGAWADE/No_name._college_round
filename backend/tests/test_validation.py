"""Unit tests for P2 validation: text normalization, span location, and quote verification."""
import json
from pathlib import Path

import pytest
from app.models import Page
from app.validation.quotes import verify_quote
from app.validation.spans import locate_span
from app.validation.text import normalize_text


def test_normalize_text():
    # CRLF and CR should become LF
    assert normalize_text("Hello\r\nWorld\rAgain\n") == "Hello\nWorld\nAgain\n"
    # NFC normalization
    decomposed = "e\u0301"  # 'e' + combining acute accent
    assert normalize_text(decomposed) == "\u00e9"


def test_locate_span_exact():
    doc = "The policy allows returns within 30 days of purchase."
    span = "returns within 30 days"
    res = locate_span(doc, span)
    assert res is not None
    start, end = res
    assert doc[start:end] == span


def test_locate_span_whitespace():
    doc = "The policy allows returns\n  within   30 days of purchase."
    span = "returns within 30 days"
    res = locate_span(doc, span)
    assert res is not None
    start, end = res
    assert "returns" in doc[start:end]
    assert "30 days" in doc[start:end]


def test_locate_span_unicode_and_emoji():
    doc = "Welcome 🚀 to our service! Here is a claim ✨ about speed."
    span = "claim ✨ about speed"
    res = locate_span(doc, span)
    assert res is not None
    start, end = res
    assert doc[start:end] == span


def test_locate_span_not_found():
    doc = "Short document."
    res = locate_span(doc, "Completely unrelated statement not in text")
    assert res is None


def test_verify_quote_whitespace_and_newlines():
    pages = [Page(page=1, text="Items may be returned\nwithin 30 days of delivery for a full refund.")]
    quote = "Items may be returned within 30 days of delivery"
    match = verify_quote(quote, pages)
    assert match is not None
    assert match.page == 1
    # Verify offsets point to valid slice in page text
    matched_text = pages[0].text[match.start:match.end]
    assert "returned" in matched_text
    assert "30 days" in matched_text


def test_verify_quote_changed_digit_fails():
    pages = [Page(page=1, text="Items may be returned within 30 days of delivery.")]
    # 60 days vs 30 days: MUST fail because quotes are exact-only after normalisation
    quote = "Items may be returned within 60 days of delivery"
    match = verify_quote(quote, pages)
    assert match is None, "Fuzzy quote matching is strictly forbidden!"


def test_verify_quote_two_pages_fails():
    pages = [
        Page(page=1, text="Items may be returned within 30 days"),
        Page(page=2, text="of delivery for a full refund."),
    ]
    # Quote spanning page 1 and page 2 cannot be cited on a single page
    quote = "Items may be returned within 30 days of delivery"
    match = verify_quote(quote, pages)
    assert match is None


def test_verify_quote_golden_example():
    root = Path(__file__).parent.parent.parent
    mock_audit_path = root / "mock" / "audit.json"
    golden_source_path = root / "data" / "golden_source.txt"

    if not mock_audit_path.exists() or not golden_source_path.exists():
        pytest.skip("Golden fixtures not found")

    mock_audit = json.loads(mock_audit_path.read_text(encoding="utf-8"))
    source_text = golden_source_path.read_text(encoding="utf-8")
    pages = [Page(page=1, text=source_text)]

    verified_count = 0
    for claim in mock_audit.get("claims", []):
        for ev in claim.get("evidence", []):
            quote = ev.get("quote")
            if quote:
                match = verify_quote(quote, pages)
                assert match is not None, f"Failed to verify golden quote: {quote}"
                verified_count += 1
    assert verified_count >= 3
