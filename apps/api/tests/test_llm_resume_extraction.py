"""Unit coverage for services/llm.py's extract_resume_data — specifically the "is this actually
a resume" gate, one level below test_resume_router.py's fixture (which mocks
llm.extract_resume_data wholesale and so never exercises this logic at all). Mocks `_complete`
directly so these tests never make a real Groq call."""

import json

import pytest

from app.core.errors import ApiError
from app.services import llm


def _json_response(**overrides: object) -> str:
    payload: dict[str, object] = {
        "is_resume": True,
        "candidate_background": None,
        "skills": [],
        "years_experience": None,
    }
    payload.update(overrides)
    return json.dumps(payload)


async def test_extract_resume_data_returns_the_extraction_for_a_real_resume(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_complete(messages: object, *, max_tokens: int = 0) -> str:
        return _json_response(
            candidate_background="I have five years of backend experience.",
            skills=["Python", "SQL"],
            years_experience=5,
        )

    monkeypatch.setattr(llm, "_complete", fake_complete)

    result = await llm.extract_resume_data("Jane Doe, Senior Backend Engineer...")

    assert result.is_resume is True
    assert result.skills == ["Python", "SQL"]
    assert result.years_experience == 5


async def test_extract_resume_data_rejects_a_document_the_model_says_is_not_a_resume(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    call_count = 0

    async def fake_complete(messages: object, *, max_tokens: int = 0) -> str:
        nonlocal call_count
        call_count += 1
        return _json_response(is_resume=False)

    monkeypatch.setattr(llm, "_complete", fake_complete)

    with pytest.raises(ApiError) as exc_info:
        await llm.extract_resume_data("This certifies that Jane Doe completed an internship...")

    assert exc_info.value.code == "resume_content_not_recognized"
    assert exc_info.value.status_code == 422
    # A well-formed, honest "this isn't a resume" answer is not a validation failure — it must
    # not trigger the retry-on-invalid-shape path and waste a second Groq call.
    assert call_count == 1


async def test_extract_resume_data_ignores_fabricated_fields_when_not_a_resume(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Even if the model both says is_resume=false AND (incorrectly) still filled in some
    fields, the caller only ever sees the rejection — nothing fabricated leaks through."""

    async def fake_complete(messages: object, *, max_tokens: int = 0) -> str:
        return _json_response(is_resume=False, skills=["Certificate Design"])

    monkeypatch.setattr(llm, "_complete", fake_complete)

    with pytest.raises(ApiError) as exc_info:
        await llm.extract_resume_data("Internship completion certificate...")

    assert exc_info.value.code == "resume_content_not_recognized"
