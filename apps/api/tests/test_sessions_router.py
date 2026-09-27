from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Category, Difficulty, Role
from app.models.question import Question


def _auth_headers(user: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {user['access_token']}"}


def _session_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "role": "backend",
        "difficulty": "medium",
        "experience_level": "mid",
        "focus": "mixed",
        "question_count": 5,
        "answer_cap_s": 120,
    }
    payload.update(overrides)
    return payload


async def _seed_question(
    db_session: AsyncSession,
    *,
    role: Role = Role.BACKEND,
    difficulty: Difficulty = Difficulty.MEDIUM,
    category: Category = Category.BEHAVIORAL,
) -> None:
    """A "mixed" focus's first question is always Category.BEHAVIORAL (see
    question_orchestrator.category_for_position), which is what every test here needs seeded
    for session creation to succeed instead of 422ing with no_questions_available."""
    db_session.add(Question(role=role, difficulty=difficulty, category=category, text="Q"))
    await db_session.commit()


async def test_create_session_returns_the_new_session_with_a_first_question(
    client: TestClient, db_session: AsyncSession, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()
    await _seed_question(db_session)

    response = client.post("/v1/sessions", json=_session_payload(), headers=_auth_headers(user))

    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "backend"
    assert body["difficulty"] == "medium"
    assert body["experience_level"] == "mid"
    assert body["focus"] == "mixed"
    assert body["question_count"] == 5
    assert body["answer_cap_s"] == 120
    assert body["status"] == "in_progress"
    assert body["current_question_number"] == 1
    assert body["user_id"] == user["user"]["id"]

    current_question = body["current_question"]
    assert current_question is not None
    assert current_question["sequence_number"] == 1
    assert current_question["text"]
    assert current_question["category"] in {"behavioral", "technical", "situational"}


async def test_create_session_accepts_optional_personalization_fields(
    client: TestClient, db_session: AsyncSession, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()
    await _seed_question(db_session)

    response = client.post(
        "/v1/sessions",
        json=_session_payload(
            company="Acme Corp",
            industry="Fintech",
            job_description="Build and scale backend services.",
            candidate_background="5 years building distributed systems.",
            skills=["Python", "SQL", ""],
            focus_topics=["distributed systems", "caching"],
            years_experience=5,
            interviewer_style="realistic",
            language="en",
        ),
        headers=_auth_headers(user),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["company"] == "Acme Corp"
    assert body["industry"] == "Fintech"
    assert body["interviewer_style"] == "realistic"
    assert body["language"] == "en"


def test_create_session_rejects_an_invalid_question_count(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.post(
        "/v1/sessions",
        json=_session_payload(question_count=4),
        headers=_auth_headers(user),
    )

    assert response.status_code == 422


def test_create_session_rejects_an_invalid_answer_cap(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.post(
        "/v1/sessions",
        json=_session_payload(answer_cap_s=90),
        headers=_auth_headers(user),
    )

    assert response.status_code == 422


def test_create_session_rejects_an_oversized_job_description(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.post(
        "/v1/sessions",
        json=_session_payload(job_description="x" * 12_001),
        headers=_auth_headers(user),
    )

    assert response.status_code == 422


def test_create_session_rejects_an_oversized_candidate_background(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.post(
        "/v1/sessions",
        json=_session_payload(candidate_background="x" * 8_001),
        headers=_auth_headers(user),
    )

    assert response.status_code == 422


def test_create_session_rejects_too_many_focus_topics(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.post(
        "/v1/sessions",
        json=_session_payload(focus_topics=[f"topic-{i}" for i in range(11)]),
        headers=_auth_headers(user),
    )

    assert response.status_code == 422


def test_create_session_rejects_an_oversized_focus_topic(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.post(
        "/v1/sessions",
        json=_session_payload(focus_topics=["x" * 81]),
        headers=_auth_headers(user),
    )

    assert response.status_code == 422


def test_create_session_requires_auth(client: TestClient) -> None:
    response = client.post("/v1/sessions", json=_session_payload())

    assert response.status_code == 401


async def test_list_sessions_only_returns_the_callers_own_sessions(
    client: TestClient, db_session: AsyncSession, register_user: Callable[..., dict[str, Any]]
) -> None:
    user_a = register_user("a@example.com")
    user_b = register_user("b@example.com")
    await _seed_question(db_session, role=Role.BACKEND)
    await _seed_question(db_session, role=Role.FRONTEND)

    client.post("/v1/sessions", json=_session_payload(), headers=_auth_headers(user_a))
    client.post(
        "/v1/sessions",
        json=_session_payload(role="frontend"),
        headers=_auth_headers(user_b),
    )

    response = client.get("/v1/sessions", headers=_auth_headers(user_a))

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["role"] == "backend"


async def test_list_sessions_respects_limit(
    client: TestClient, db_session: AsyncSession, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()
    for role in (Role.BACKEND, Role.FRONTEND, Role.DATA_SCIENTIST):
        await _seed_question(db_session, role=role)

    for role in ("backend", "frontend", "data-scientist"):
        response = client.post(
            "/v1/sessions", json=_session_payload(role=role), headers=_auth_headers(user)
        )
        assert response.status_code == 201

    response = client.get("/v1/sessions?limit=2", headers=_auth_headers(user))

    assert response.status_code == 200
    assert len(response.json()) == 2


def test_get_session_summary_requires_auth(client: TestClient) -> None:
    response = client.get("/v1/sessions/does-not-matter")

    assert response.status_code == 401


async def test_get_session_summary_is_scoped_to_the_owner(
    client: TestClient, db_session: AsyncSession, register_user: Callable[..., dict[str, Any]]
) -> None:
    owner = register_user("owner@example.com")
    other = register_user("other@example.com")
    await _seed_question(db_session)
    session_id = client.post(
        "/v1/sessions", json=_session_payload(), headers=_auth_headers(owner)
    ).json()["id"]

    response = client.get(f"/v1/sessions/{session_id}", headers=_auth_headers(other))

    assert response.status_code == 404


async def test_get_session_summary_before_any_answers(
    client: TestClient, db_session: AsyncSession, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()
    await _seed_question(db_session)
    session_id = client.post(
        "/v1/sessions", json=_session_payload(), headers=_auth_headers(user)
    ).json()["id"]

    response = client.get(f"/v1/sessions/{session_id}", headers=_auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["questions_completed"] == 0
    assert body["overall_score"] is None
    assert body["category_breakdown"] == []
    assert body["session"]["id"] == session_id
