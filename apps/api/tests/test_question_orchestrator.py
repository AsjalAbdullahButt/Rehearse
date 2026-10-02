import random
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Category, Difficulty, InterviewMode, QuestionSource, Role
from app.models.question import Question
from app.schemas.planning import AnalyzedCompetency, GeneratedQuestion, JobAnalysis
from app.services import llm, repo
from app.services.question_orchestrator import (
    MAX_GENERATED_PER_SESSION,
    select_next_question,
)


def _headers(user: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {user['access_token']}"}


def _payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "role": "backend",
        "difficulty": "medium",
        "experience_level": "mid",
        "focus": "technical",
        "question_count": 8,
        "answer_cap_s": 120,
        "interviewer_style": "realistic",
    }
    payload.update(overrides)
    return payload


async def _bank(
    db: AsyncSession,
    text: str,
    *,
    competency: str | None,
    level: int | None = 3,
    category: Category = Category.TECHNICAL,
    role: Role = Role.BACKEND,
) -> None:
    db.add(
        Question(
            role=role,
            difficulty=Difficulty.MEDIUM,
            category=category,
            text=text,
            competency=competency,
            level=level,
        )
    )
    await db.commit()


def _create(client: TestClient, user: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    response = client.post("/v1/sessions", json=_payload(**overrides), headers=_headers(user))
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


async def test_first_question_comes_from_the_bank_for_the_top_competency(
    client: TestClient, db_session: AsyncSession, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()
    await _bank(db_session, "Explain how a B-tree index speeds up queries.", competency="sql")
    await _bank(db_session, "Explain cache invalidation.", competency="caching")

    question = _create(client, user)["current_question"]

    assert question["source"] == "bank"
    assert question["competency"] == "sql"
    assert question["selection_reason"] == "coverage"
    assert question["level"] == 3


async def test_generates_a_question_when_the_bank_has_no_match(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = register_user()
    await _bank(db_session, "An unrelated filler question about nothing.", competency="testing")
    seen: dict[str, Any] = {}

    async def fake_generate(**kwargs: Any) -> GeneratedQuestion:
        seen.update(kwargs)
        return GeneratedQuestion(text="How would you shard a 500M-row orders table?")

    monkeypatch.setattr(llm, "generate_question", fake_generate)

    question = _create(client, user, language="ur", interviewer_style="challenging")[
        "current_question"
    ]

    assert question["source"] == "generated"
    assert question["text"] == "How would you shard a 500M-row orders table?"
    assert question["level"] == 4  # medium (3) + the challenging style's offset
    assert seen["language"] == "ur"
    assert seen["policy"].style == "challenging"
    assert seen["competency"] == question["competency"]


async def test_generated_questions_receive_the_interview_mode(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = register_user()
    await _bank(db_session, "An unrelated filler question.", competency="testing")
    seen: dict[str, Any] = {}

    async def fake_generate(**kwargs: Any) -> GeneratedQuestion:
        seen.update(kwargs)
        return GeneratedQuestion(text="Design a rate limiter for a public API.")

    monkeypatch.setattr(llm, "generate_question", fake_generate)

    _create(client, user, interview_mode="system_design")

    assert seen["interview_mode"] == InterviewMode.SYSTEM_DESIGN


async def test_a_generation_failure_falls_back_to_the_bank_instead_of_failing(
    client: TestClient, db_session: AsyncSession, register_user: Callable[..., dict[str, Any]]
) -> None:
    """conftest makes generate_question raise by default, simulating a provider outage."""
    user = register_user()
    await _bank(db_session, "Describe your testing strategy.", competency="testing")

    question = _create(client, user)["current_question"]

    assert question["text"] == "Describe your testing strategy."
    assert question["source"] == "bank"
    assert question["selection_reason"] == "fallback"


async def test_a_duplicate_generated_question_is_rejected(
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = register_user()
    await _bank(db_session, "Describe your testing strategy.", competency="testing")
    await _bank(db_session, "Describe your debugging process.", competency="debugging")
    body = _create(client, user)
    served = body["current_question"]["text"]

    async def echo_generate(**kwargs: Any) -> GeneratedQuestion:
        return GeneratedQuestion(text=served)

    monkeypatch.setattr(llm, "generate_question", echo_generate)
    session = await repo.get_session_for_user(
        db_session, session_id=body["id"], user_id=user["user"]["id"]
    )
    assert session is not None

    selected = await select_next_question(db_session, session=session, prior_follow_up=None)

    assert selected.source == QuestionSource.BANK
    assert selected.text != served


async def test_generation_is_capped_per_session(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = await repo.create_user(db_session, email="a@example.com", password_hash="x")
    session = await repo.create_session(
        db_session,
        user_id=user.id,
        role="backend",
        difficulty=Difficulty.MEDIUM,
        question_count=8,
    )
    for n in range(MAX_GENERATED_PER_SESSION + 2):
        await _bank(db_session, f"Fallback question number {n}.", competency="testing")
    calls = 0

    async def fake_generate(**kwargs: Any) -> GeneratedQuestion:
        nonlocal calls
        calls += 1
        return GeneratedQuestion(text=f"Generated question number {calls}, please answer.")

    monkeypatch.setattr(llm, "generate_question", fake_generate)

    for sequence in range(1, MAX_GENERATED_PER_SESSION + 2):
        selected = await select_next_question(
            db_session, session=session, prior_follow_up=None, rng=random.Random(0)
        )
        await repo.create_session_question(
            db_session,
            session_id=session.id,
            sequence_number=sequence,
            text=selected.text,
            category=selected.category,
            source=selected.source,
            question_id=selected.question_id,
            competency=selected.competency,
            level=selected.level,
            selection_reason=selected.reason,
        )

    assert calls == MAX_GENERATED_PER_SESSION
    questions = await repo.list_session_questions_for_session(db_session, session_id=session.id)
    assert questions[-1].source == QuestionSource.BANK


async def test_custom_role_session_uses_generated_questions_and_the_job_plan(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = register_user()

    async def fake_analyze(**kwargs: Any) -> JobAnalysis:
        return JobAnalysis(
            competencies=[
                AnalyzedCompetency(name="Prompt Engineering", weight=70),
                AnalyzedCompetency(name="Communication", weight=30),
            ]
        )

    async def fake_generate(**kwargs: Any) -> GeneratedQuestion:
        return GeneratedQuestion(text=f"Question about {kwargs['competency']}, in depth please.")

    monkeypatch.setattr(llm, "analyze_job_target", fake_analyze)
    monkeypatch.setattr(llm, "generate_question", fake_generate)

    body = _create(client, user, role="AI Automation Engineer", focus="mixed")

    assert body["role"] == "ai-automation-engineer"
    assert body["role_title"] == "AI Automation Engineer"
    assert body["job_target_id"] is not None
    assert body["current_question"]["competency"] == "prompt-engineering"
    assert body["current_question"]["source"] == "generated"
