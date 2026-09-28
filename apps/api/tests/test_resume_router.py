from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.schemas.resume import ResumeExtraction
from app.services import llm
from tests.pdf_fixtures import pdf_with_no_text, pdf_with_text

_MINIMAL_PDF_MAGIC = b"%PDF-1.4\n%mock pdf content for router-level tests, not real parsing\n"
_REAL_PDF_WITH_TEXT = pdf_with_text(
    "Jane Doe. Software Engineer with 5 years of backend experience in Python and SQL."
)
_REAL_PDF_WITH_NO_TEXT = pdf_with_no_text()


def _auth_headers(user: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {user['access_token']}"}


def _post_resume(
    client: TestClient,
    *,
    user: dict[str, Any] | None,
    content_type: str = "application/pdf",
    resume_bytes: bytes = _MINIMAL_PDF_MAGIC,
) -> Any:
    headers = _auth_headers(user) if user is not None else {}
    return client.post(
        "/v1/resume/parse",
        files={"resume": ("resume.pdf", resume_bytes, content_type)},
        headers=headers,
    )


@pytest.fixture(autouse=True)
def _mock_extraction(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every test here goes through the real /v1/resume/parse endpoint, including its own real
    PDF-text extraction (a tiny real PDF), but stubs the Groq call itself — same pattern as
    test_answers_router.py's _mock_groq fixture, and for the same reason: no GROQ_API_KEY exists
    in this environment (see AGENTS.md)."""

    async def fake_extract_resume_data(resume_text: str) -> ResumeExtraction:
        assert resume_text  # the real extracted text was actually passed through
        return ResumeExtraction(
            candidate_background="I have five years of experience building backend services.",
            skills=["Python", "SQL"],
            years_experience=5,
        )

    monkeypatch.setattr(llm, "extract_resume_data", fake_extract_resume_data)


def test_parse_resume_requires_auth(client: TestClient) -> None:
    response = _post_resume(client, user=None)

    assert response.status_code == 401


def test_parse_resume_rejects_a_non_pdf_content_type(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = _post_resume(client, user=user, content_type="text/plain")

    assert response.status_code == 415


def test_parse_resume_rejects_a_payload_that_isnt_really_a_pdf(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    """A spoofed Content-Type header alone isn't enough — same magic-byte-sniffing precedent as
    app/routers/answers.py for audio uploads."""
    user = register_user()

    response = _post_resume(client, user=user, resume_bytes=b"this is not a pdf at all")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_resume_content"


def test_parse_resume_rejects_an_oversized_file(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()
    oversized = _MINIMAL_PDF_MAGIC + b"x" * (2 * 1024 * 1024 + 1)

    response = _post_resume(client, user=user, resume_bytes=oversized)

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


def test_parse_resume_accepts_a_real_pdf_close_to_the_size_limit(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    """A file just under MAX_RESUME_FILE_BYTES must not be rejected merely because the multipart
    envelope (boundary, headers, other form fields) around it pushes the whole HTTP request
    slightly past 2MB — _read_capped bounds only the `resume` field's own bytes, not the request
    as a whole (see app/core/limits.py's MAX_RESUME_REQUEST_BYTES docstring for the matching BFF
    fix). Uses a real, valid PDF (not the mock-magic-bytes fixture) padded via its own content
    stream, so this exercises real PDF parsing at the boundary, not just the size check."""
    user = register_user()
    near_limit = pdf_with_text("A" * (2 * 1024 * 1024 - 2048))
    assert near_limit != b""
    assert len(near_limit) <= 2 * 1024 * 1024

    response = _post_resume(client, user=user, resume_bytes=near_limit)

    assert response.status_code == 200


def test_parse_resume_returns_the_extracted_fields_for_a_real_pdf_with_text(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = _post_resume(client, user=user, resume_bytes=_REAL_PDF_WITH_TEXT)

    assert response.status_code == 200
    body = response.json()
    assert body["candidate_background"]
    assert body["skills"] == ["Python", "SQL"]
    assert body["years_experience"] == 5


def test_parse_resume_rejects_a_pdf_with_no_extractable_text(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = _post_resume(client, user=user, resume_bytes=_REAL_PDF_WITH_NO_TEXT)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "empty_resume_text"


def test_parse_resume_enforces_a_rate_limit(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    responses = [
        _post_resume(client, user=user, resume_bytes=_REAL_PDF_WITH_TEXT) for _ in range(11)
    ]

    assert responses[-1].status_code == 429
    assert responses[-1].json()["error"]["code"] == "rate_limited"
    assert "Retry-After" in responses[-1].headers
