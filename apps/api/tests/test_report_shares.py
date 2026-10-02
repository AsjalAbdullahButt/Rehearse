from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Category, Difficulty, Role
from app.models.question import Question
from app.schemas.feedback import LLMFeedback, TechnicalRubric
from app.schemas.transcription import TranscriptionResult, WordTiming
from app.services import llm, stt


def _auth_headers(user: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {user['access_token']}"}


async def _seed_question(db_session: AsyncSession) -> None:
    db_session.add(
        Question(
            role=Role.BACKEND,
            difficulty=Difficulty.MEDIUM,
            category=Category.TECHNICAL,
            text="How would you design a rate limiter?",
        )
    )
    await db_session.commit()


def _fake_transcription() -> TranscriptionResult:
    transcript = "I designed a token bucket rate limiter."
    words = [
        WordTiming(word=word, start=i * 0.5, end=i * 0.5 + 0.4)
        for i, word in enumerate(transcript.split())
    ]
    return TranscriptionResult(transcript=transcript, words=words, duration_s=30.0)


def _fake_feedback() -> LLMFeedback:
    return LLMFeedback(
        rubric=TechnicalRubric(correctness=8, depth=7, tradeoffs=6, communication=8),
        clarity=8,
        on_topic=True,
        strengths=["Clearly explained the token bucket approach."],
        improvements=["Mention the burst policy.", "Discuss tradeoffs."],
        evidence=["I designed a token bucket rate limiter."],
        rambling_notes="",
        reference_answer="A stronger answer would define the algorithm and tradeoffs.",
        follow_up_question="How would you handle bursts?",
    )


@pytest.fixture(autouse=True)
def _mock_groq(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_transcribe(
        audio_bytes: bytes, filename: str, language: str | None = None
    ) -> TranscriptionResult:
        return _fake_transcription()

    async def fake_generate_feedback(
        *,
        role: str,
        category: Category,
        question_text: str,
        transcript: str,
        candidate_context: dict[str, Any],
        policy: object = None,
        language: str | None = None,
    ) -> LLMFeedback:
        return _fake_feedback()

    monkeypatch.setattr(stt, "transcribe", fake_transcribe)
    monkeypatch.setattr(llm, "generate_feedback", fake_generate_feedback)


async def _create_answer(client: TestClient, db_session: AsyncSession, user: dict[str, Any]) -> str:
    await _seed_question(db_session)
    session_response = client.post(
        "/v1/sessions",
        json={
            "role": "backend",
            "difficulty": "medium",
            "experience_level": "mid",
            "focus": "technical",
            "question_count": 3,
            "answer_cap_s": 120,
        },
        headers=_auth_headers(user),
    )
    assert session_response.status_code == 201, session_response.text
    session = session_response.json()

    answer_response = client.post(
        "/v1/answers",
        data={
            "session_id": session["id"],
            "session_question_id": session["current_question"]["id"],
        },
        files={"audio": ("answer.webm", b"\x1a\x45\xdf\xa3fake-webm", "audio/webm")},
        headers=_auth_headers(user),
    )
    assert answer_response.status_code == 201, answer_response.text
    return str(answer_response.json()["id"])


async def test_report_share_public_read_and_revoke(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    answer_id = await _create_answer(client, db_session, user)

    create_response = client.post(
        f"/v1/reports/{answer_id}/share",
        json={"audience": "recruiter", "expires_in_days": 7},
        headers=_auth_headers(user),
    )

    assert create_response.status_code == 201, create_response.text
    created = create_response.json()
    assert created["token"]
    assert created["url"].endswith(created["token"])

    list_response = client.get(f"/v1/reports/{answer_id}/shares", headers=_auth_headers(user))
    assert list_response.status_code == 200
    listed = list_response.json()
    assert listed[0]["token"] is None
    assert listed[0]["is_active"] is True

    public_response = client.get(f"/v1/shared-reports/{created['token']}")
    assert public_response.status_code == 200, public_response.text
    public_body = public_response.json()
    assert public_body["report"]["id"] == answer_id
    assert public_body["session"]["questions_completed"] == 1

    revoke_response = client.delete(
        f"/v1/reports/shares/{created['id']}", headers=_auth_headers(user)
    )
    assert revoke_response.status_code == 204

    revoked_public_response = client.get(f"/v1/shared-reports/{created['token']}")
    assert revoked_public_response.status_code == 404


async def test_user_cannot_share_another_users_report(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    owner = register_user(email="owner@example.com")
    other = register_user(email="other@example.com")
    answer_id = await _create_answer(client, db_session, owner)

    response = client.post(
        f"/v1/reports/{answer_id}/share",
        json={"audience": "mentor", "expires_in_days": 14},
        headers=_auth_headers(other),
    )

    assert response.status_code == 404
