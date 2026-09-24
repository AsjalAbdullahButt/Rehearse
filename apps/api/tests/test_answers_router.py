from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.enums import Category, Difficulty, Role
from app.models.question import Question
from app.schemas.feedback import LLMFeedback, StarScores
from app.schemas.transcription import TranscriptionResult, WordTiming
from app.services import llm, stt


def _auth_headers(user: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {user['access_token']}"}


async def _seed_question(db_session: AsyncSession) -> str:
    question = Question(
        role=Role.BACKEND,
        difficulty=Difficulty.MEDIUM,
        category=Category.TECHNICAL,
        text="How would you design a rate limiter?",
    )
    db_session.add(question)
    await db_session.commit()
    await db_session.refresh(question)
    return question.id


def _create_session(client: TestClient, user: dict[str, Any]) -> str:
    response = client.post(
        "/v1/sessions",
        json={"role": "backend", "difficulty": "medium"},
        headers=_auth_headers(user),
    )
    assert response.status_code == 201
    session_id: str = response.json()["id"]
    return session_id


def _fake_transcription(
    transcript: str = "I designed a token bucket rate limiter.", duration_s: float = 30.0
) -> TranscriptionResult:
    words = [
        WordTiming(word=word, start=i * 0.5, end=i * 0.5 + 0.4)
        for i, word in enumerate(transcript.split())
    ]
    return TranscriptionResult(transcript=transcript, words=words, duration_s=duration_s)


def _fake_feedback() -> LLMFeedback:
    return LLMFeedback(
        star=StarScores(situation=7, task=7, action=8, result=7),
        clarity=8,
        on_topic=True,
        rambling_notes="",
        tips=["Be more specific.", "Quantify the impact.", "Mention tradeoffs."],
        sample_answer="A stronger sample answer would open with the constraint...",
        follow_up_question="How would you handle a burst of traffic?",
    )


def _post_answer(
    client: TestClient,
    *,
    session_id: str,
    question_id: str,
    user: dict[str, Any],
    time_cap_s: int = 120,
    content_type: str = "audio/webm",
    audio_bytes: bytes = b"fake-webm-bytes",
) -> Any:
    return client.post(
        "/v1/answers",
        data={
            "session_id": session_id,
            "question_id": question_id,
            "time_cap_s": str(time_cap_s),
        },
        files={"audio": ("answer.webm", audio_bytes, content_type)},
        headers=_auth_headers(user),
    )


@pytest.fixture(autouse=True)
def _mock_groq(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_transcribe(audio_bytes: bytes, filename: str) -> TranscriptionResult:
        return _fake_transcription()

    async def fake_generate_feedback(
        *, role: str, question_text: str, transcript: str
    ) -> LLMFeedback:
        return _fake_feedback()

    monkeypatch.setattr(stt, "transcribe", fake_transcribe)
    monkeypatch.setattr(llm, "generate_feedback", fake_generate_feedback)


async def test_create_answer_happy_path(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    response = _post_answer(client, session_id=session_id, question_id=question_id, user=user)

    assert response.status_code == 201
    body = response.json()
    assert body["transcript"] == "I designed a token bucket rate limiter."
    assert body["session_id"] == session_id
    assert body["question_id"] == question_id
    assert body["feedback"]["star"]["action"] == 8
    assert body["feedback"]["tips"] == [
        "Be more specific.",
        "Quantify the impact.",
        "Mention tradeoffs.",
    ]
    assert body["filler_count"] == 0
    assert body["wpm"] > 0


async def test_create_answer_computes_fillers_from_the_transcript(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_transcribe(audio_bytes: bytes, filename: str) -> TranscriptionResult:
        return _fake_transcription(transcript="Um, so, uh, I basically built a rate limiter.")

    monkeypatch.setattr(stt, "transcribe", fake_transcribe)

    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    response = _post_answer(client, session_id=session_id, question_id=question_id, user=user)

    assert response.status_code == 201
    assert response.json()["filler_count"] == 3


async def test_create_answer_rejects_unknown_session(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)

    response = _post_answer(client, session_id="does-not-exist", question_id=question_id, user=user)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "session_not_found"


async def test_create_answer_rejects_another_users_session(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user_a = register_user("a@example.com")
    user_b = register_user("b@example.com")
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user_a)

    response = _post_answer(client, session_id=session_id, question_id=question_id, user=user_b)

    assert response.status_code == 404


async def test_create_answer_rejects_unknown_question(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()
    session_id = _create_session(client, user)

    response = _post_answer(client, session_id=session_id, question_id="does-not-exist", user=user)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "question_not_found"


async def test_create_answer_rejects_non_webm_ogg_content_type(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    response = _post_answer(
        client,
        session_id=session_id,
        question_id=question_id,
        user=user,
        content_type="audio/mpeg",
    )

    assert response.status_code == 415


async def test_create_answer_rejects_uploads_over_4mb(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    oversized = b"0" * (4 * 1024 * 1024 + 1)
    response = _post_answer(
        client,
        session_id=session_id,
        question_id=question_id,
        user=user,
        audio_bytes=oversized,
    )

    assert response.status_code == 413


async def test_create_answer_rejects_duration_beyond_the_time_cap(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_transcribe(audio_bytes: bytes, filename: str) -> TranscriptionResult:
        return _fake_transcription(duration_s=200.0)

    monkeypatch.setattr(stt, "transcribe", fake_transcribe)

    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    response = _post_answer(
        client, session_id=session_id, question_id=question_id, user=user, time_cap_s=60
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "duration_exceeds_cap"


async def test_create_answer_rejects_silent_recordings(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_transcribe(audio_bytes: bytes, filename: str) -> TranscriptionResult:
        return _fake_transcription(transcript="   ")

    monkeypatch.setattr(stt, "transcribe", fake_transcribe)

    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    response = _post_answer(client, session_id=session_id, question_id=question_id, user=user)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "empty_transcript"


async def test_create_answer_enforces_the_daily_rate_limit(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    for _ in range(30):
        db_session.add(
            Answer(
                session_id=session_id,
                user_id=user["user"]["id"],
                question_id=question_id,
                question_text="Q",
                transcript="A",
                duration_s=30,
                wpm=100,
            )
        )
    await db_session.commit()

    response = _post_answer(client, session_id=session_id, question_id=question_id, user=user)

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"


async def test_create_answer_enforces_the_per_minute_burst_limit(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    """Separate from the 30/day cap above: even a user nowhere near that cap gets stopped by
    a tighter per-minute burst limit, since each call costs real Groq usage."""
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    responses = [
        _post_answer(client, session_id=session_id, question_id=question_id, user=user)
        for _ in range(7)
    ]

    assert [r.status_code for r in responses[:6]] == [201] * 6
    assert responses[6].status_code == 429
    assert responses[6].json()["error"]["code"] == "rate_limited"
    assert "Retry-After" in responses[6].headers


async def test_get_answer_returns_the_full_report(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    create_response = _post_answer(
        client, session_id=session_id, question_id=question_id, user=user
    )
    answer_id = create_response.json()["id"]

    response = client.get(f"/v1/answers/{answer_id}", headers=_auth_headers(user))

    assert response.status_code == 200
    assert response.json()["id"] == answer_id


async def test_get_answer_is_scoped_to_the_owner(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user_a = register_user("a@example.com")
    user_b = register_user("b@example.com")
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user_a)

    create_response = _post_answer(
        client, session_id=session_id, question_id=question_id, user=user_a
    )
    answer_id = create_response.json()["id"]

    response = client.get(f"/v1/answers/{answer_id}", headers=_auth_headers(user_b))

    assert response.status_code == 404
