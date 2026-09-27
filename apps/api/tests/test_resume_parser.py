"""Unit coverage for app/services/resume_parser.py's PDF text extraction — see pdf_fixtures.py
for how the test PDFs are built."""

from typing import Any

import pytest

from app.core.errors import ApiError
from app.services import resume_parser
from app.services.resume_parser import MAX_EXTRACTED_CHARS, MIN_EXTRACTED_CHARS, extract_text
from tests.pdf_fixtures import pdf_with_no_text, pdf_with_text

_RESUME_TEXT = "Jane Doe. Software Engineer with 5 years of backend experience in Python and SQL."


def test_extracts_text_from_a_readable_pdf() -> None:
    text = extract_text(pdf_with_text(_RESUME_TEXT))

    assert _RESUME_TEXT in text


def test_rejects_a_pdf_with_no_extractable_text() -> None:
    with pytest.raises(ApiError) as exc_info:
        extract_text(pdf_with_no_text())

    assert exc_info.value.code == "empty_resume_text"
    assert exc_info.value.status_code == 422


def test_rejects_a_file_that_isnt_a_pdf_at_all() -> None:
    with pytest.raises(ApiError) as exc_info:
        extract_text(b"this is definitely not a pdf file, just some plain bytes")

    assert exc_info.value.code == "invalid_resume_content"
    assert exc_info.value.status_code == 422


def test_min_extracted_chars_is_a_meaningful_floor() -> None:
    # Guards against a future accidental drop to e.g. 0 or 1, which would defeat the whole point
    # of this check (rejecting a near-empty scanned-image PDF).
    assert MIN_EXTRACTED_CHARS >= 20


class _FakePage:
    def __init__(self, text: str) -> None:
        self._text = text

    def extract_text(self) -> str:
        return self._text


class _FakeReader:
    """Stands in for pypdf.PdfReader so this test can assert the char cap without needing to
    author a genuinely huge real PDF."""

    is_encrypted = False

    def __init__(self, _source: Any) -> None:
        self.pages = [_FakePage("x" * (MAX_EXTRACTED_CHARS // 2 + 1)) for _ in range(10)]


def test_caps_extracted_text_length_regardless_of_how_much_the_pdf_contains(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(resume_parser, "PdfReader", _FakeReader)

    text = extract_text(b"irrelevant-with-a-fake-reader")

    assert len(text) <= MAX_EXTRACTED_CHARS
