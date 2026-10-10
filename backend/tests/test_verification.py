from __future__ import annotations

from app.models import Page
from app.validation.quotes import verify_quote
from app.validation.spans import locate_span
from app.validation.text import normalize_text


def test_normalize_text_uses_nfc_and_lf() -> None:
    assert normalize_text("Cafe\u0301\r\nPolicy") == "Café\nPolicy"


def test_locate_span_returns_unicode_code_point_offsets() -> None:
    answer = "✅ The fee is 30 days."
    span = "The fee is 30 days."
    start = answer.index(span)
    assert locate_span(answer, span) == (start, start + len(span))


def test_quote_verification_collapses_pdf_whitespace() -> None:
    pages = [Page(page=1, text="The refund window is 30\n   days from purchase.")]
    assert verify_quote("The refund window is 30 days from purchase.", pages) is not None


def test_quote_verification_rejects_changed_digit() -> None:
    pages = [Page(page=1, text="The refund window is 30 days from purchase.")]
    assert verify_quote("The refund window is 60 days from purchase.", pages) is None


def test_quote_verification_returns_correct_page() -> None:
    pages = [Page(page=1, text="First page."), Page(page=2, text="Digital items are final sale.")]
    match = verify_quote("Digital items are final sale.", pages)
    assert match is not None
    assert match.page == 2
    assert pages[1].text[match.start:match.end] == "Digital items are final sale."
