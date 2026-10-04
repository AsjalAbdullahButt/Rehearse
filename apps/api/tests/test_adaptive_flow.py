"""End-to-end through the HTTP API: answers feed the competency model, the next question reacts to
how the last one went, and sessions/mastery are owner-scoped."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Category, Difficulty, Role
from app.models.question import Question
from app.schemas.feedback import LLMFeedback, TechnicalRubric
from app.schemas.transcription import TranscriptionResult
from app.services import llm, stt
from tests.test_answers_router import (
    _auth_headers,
    _create_session,
    _fake_transcription,
    _post_answer,
)


def _feedback(
    score: int, follow_up: str = "Why that approach, and what is the tradeoff?"
) -> LLMFeedback:
    return LLMFeedback(
        rubric=TechnicalRubric(
            correctness=score, depth=score, tradeoffs=score, communication=score
        ),
        clarity=score,
        on_topic=True,
        strengths=["Clear."],
        improvements=["Go deeper."],
        evidence=[],
        rambling_notes="",
        reference_answer="A reference answer.",
        follow_up_question=follow_up,
    )


async def _seed(db: AsyncSession, text: str, competency: str, level: int) -> None:
    db.add(
        Question(
            role=Role.BACKEND,
            difficulty=Difficulty.MEDIUM,
            category=Category.TECHNICAL,
            text=text,
            competency=competency,
            level=level,
        )
    )
    await db.commit()


@pytest.fixture
def score_for_answers(monkeypatch: pytest.MonkeyPatch) -> Callable[[int], None]:
    """Lets a test choose what score the (mocked) grader awards, and records the language the
    STT call was asked to use."""
    state: dict[str, Any] = {"score": 8, "languages": []}

    async def fake_transcribe(
        audio_bytes: bytes, filename: str, language: str | None = None
    ) -> TranscriptionResult:
        state["languages"].append(language)
        return _fake_transcription()

    async def fake_feedback(**kwargs: Any) -> LLMFeedback:
        return _feedback(state["score"])

    monkeypatch.setattr(stt, "transcribe", fake_transcribe)
    monkeypatch.setattr(llm, "generate_feedback", fake_feedback)

    def _set(score: int) -> None:
        state["score"] = score

    _set.state = state  # type: ignore[attr-defined]
    return _set


def _answer(client: TestClient, user: dict[str, Any], session: dict[str, Any]) -> dict[str, Any]:
    response = _post_answer(
        client,
        session_id=session["id"],
        session_question_id=session["current_question"]["id"],
        user=user,
    )
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


async def test_a_strong_answer_makes_the_next_question_harder_on_the_same_competency(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    score_for_answers: Callable[[int], None],
) -> None:
    user = register_user()
    await _seed(db_session, "Explain what a database index is.", "sql", 3)
    session = _create_session(client, user, focus="technical")
    first = session["current_question"]
    assert first["competency"] == "sql"
    score_for_answers(9)

    report = _answer(client, user, session)

    nxt = report["next_question"]
    assert nxt["competency"] == "sql"
    assert nxt["selection_reason"] == "deepen"
    assert nxt["level"] == 4
    assert nxt["source"] == "follow_up"


async def test_a_weak_answer_triggers_an_easier_diagnostic(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    score_for_answers: Callable[[int], None],
) -> None:
    user = register_user()
    await _seed(db_session, "Explain what a database index is.", "sql", 3)
    session = _create_session(client, user, focus="technical")
    score_for_answers(2)

    nxt = _answer(client, user, session)["next_question"]

    assert nxt["selection_reason"] == "diagnostic"
    assert nxt["level"] == 2


async def test_answers_update_the_persistent_mastery_model(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    score_for_answers: Callable[[int], None],
) -> None:
    user = register_user()
    await _seed(db_session, "Explain what a database index is.", "sql", 3)
    session = _create_session(client, user, focus="technical")
    score_for_answers(8)
    _answer(client, user, session)

    response = client.get("/v1/mastery?role=backend", headers=_auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert [c["competency"] for c in body["competencies"]] == ["sql"]
    sql = body["competencies"][0]
    assert sql["questions_attempted"] == 1
    assert sql["successful_attempts"] == 1
    assert sql["mastery"] > 50
    assert sql["confidence"] < 50  # one answer is not established mastery
    assert body["strongest"] is None  # too little evidence to rank anything yet


async def test_mastery_is_scoped_to_the_calling_user(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    score_for_answers: Callable[[int], None],
) -> None:
    alice = register_user("alice@example.com")
    bob = register_user("bob@example.com")
    await _seed(db_session, "Explain what a database index is.", "sql", 3)
    _answer(client, alice, _create_session(client, alice, focus="technical"))

    alice_view = client.get("/v1/mastery", headers=_auth_headers(alice)).json()
    bob_view = client.get("/v1/mastery", headers=_auth_headers(bob)).json()

    assert alice_view["competencies"]
    assert bob_view["competencies"] == []


async def test_mastery_requires_authentication(client: TestClient) -> None:
    assert client.get("/v1/mastery").status_code == 401


async def test_the_session_language_reaches_transcription(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    score_for_answers: Callable[[int], None],
) -> None:
    user = register_user()
    await _seed(db_session, "Explain what a database index is.", "sql", 3)
    response = client.post(
        "/v1/sessions",
        json={
            "role": "backend",
            "difficulty": "medium",
            "experience_level": "mid",
            "focus": "technical",
            "question_count": 5,
            "answer_cap_s": 120,
            "language": "ur",
        },
        headers=_auth_headers(user),
    )
    assert response.status_code == 201
    _answer(client, user, response.json())

    assert score_for_answers.state["languages"] == ["ur"]  # type: ignore[attr-defined]


def test_unsupported_languages_are_rejected(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()
    response = client.post(
        "/v1/sessions",
        json={
            "role": "backend",
            "difficulty": "medium",
            "experience_level": "mid",
            "focus": "technical",
            "question_count": 5,
            "answer_cap_s": 120,
            "language": "klingon",
        },
        headers=_auth_headers(user),
    )
    assert response.status_code == 422


def test_hostile_role_titles_are_rejected(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()
    for role in ("<script>alert(1)</script>", "x", "a" * 200, "role\x00"):
        response = client.post(
            "/v1/sessions",
            json={
                "role": role,
                "difficulty": "medium",
                "experience_level": "mid",
                "focus": "technical",
                "question_count": 5,
                "answer_cap_s": 120,
            },
            headers=_auth_headers(user),
        )
        assert response.status_code == 422, role


async def test_ending_a_session_early_is_persisted_and_cannot_be_repeated(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    await _seed(db_session, "Explain what a database index is.", "sql", 3)
    session = _create_session(client, user, focus="technical")

    first = client.post(f"/v1/sessions/{session['id']}/end", headers=_auth_headers(user))
    second = client.post(f"/v1/sessions/{session['id']}/end", headers=_auth_headers(user))

    assert first.status_code == 200
    assert first.json()["status"] == "ended_early"
    assert first.json()["ended_at"] is not None
    assert second.status_code == 409


async def test_a_user_cannot_end_someone_elses_session(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    owner = register_user("owner@example.com")
    intruder = register_user("intruder@example.com")
    await _seed(db_session, "Explain what a database index is.", "sql", 3)
    session = _create_session(client, owner, focus="technical")

    response = client.post(f"/v1/sessions/{session['id']}/end", headers=_auth_headers(intruder))

    assert response.status_code == 404
    still_open = client.get(f"/v1/sessions/{session['id']}", headers=_auth_headers(owner))
    assert still_open.json()["session"]["status"] == "in_progress"


async def test_an_ended_interview_no_longer_accepts_answers(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    score_for_answers: Callable[[int], None],
) -> None:
    user = register_user()
    await _seed(db_session, "Explain what a database index is.", "sql", 3)
    session = _create_session(client, user, focus="technical")
    assert (
        client.post(f"/v1/sessions/{session['id']}/end", headers=_auth_headers(user)).status_code
        == 200
    )

    response = _post_answer(
        client,
        session_id=session["id"],
        session_question_id=session["current_question"]["id"],
        user=user,
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "session_not_active"
    summary = client.get(f"/v1/sessions/{session['id']}", headers=_auth_headers(user)).json()
    assert summary["questions_completed"] == 0
    assert summary["session"]["current_question_number"] == 1  # nothing new was generated


async def test_an_existing_answer_can_still_be_retried_after_the_interview_ended(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    score_for_answers: Callable[[int], None],
) -> None:
    user = register_user()
    await _seed(db_session, "Explain what a database index is.", "sql", 3)
    session = _create_session(client, user, focus="technical")
    first = _answer(client, user, session)
    client.post(f"/v1/sessions/{session['id']}/end", headers=_auth_headers(user))

    retry = client.post(
        "/v1/answers",
        data={
            "session_id": session["id"],
            "session_question_id": session["current_question"]["id"],
            "retry_of_answer_id": first["id"],
        },
        files={"audio": ("a.webm", b"\x1a\x45\xdf\xa3audio", "audio/webm")},
        headers=_auth_headers(user),
    )

    assert retry.status_code == 201
    assert retry.json()["attempt_number"] == 2
