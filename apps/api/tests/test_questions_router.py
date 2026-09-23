from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Category, Difficulty, Role
from app.models.question import Question


async def _seed_questions(db_session: AsyncSession) -> None:
    db_session.add_all(
        [
            Question(
                role=Role.BACKEND,
                difficulty=Difficulty.EASY,
                category=Category.TECHNICAL,
                text="What's the difference between REST and GraphQL?",
            ),
            Question(
                role=Role.BACKEND,
                difficulty=Difficulty.HARD,
                category=Category.TECHNICAL,
                text="How would you design a rate limiter?",
            ),
            Question(
                role=Role.FRONTEND,
                difficulty=Difficulty.EASY,
                category=Category.TECHNICAL,
                text="What's the difference between let, const, and var?",
            ),
            Question(
                role=Role.BACKEND,
                difficulty=Difficulty.EASY,
                category=Category.BEHAVIORAL,
                text="Tell me about a backend system you designed.",
                is_active=False,
            ),
        ]
    )
    await db_session.commit()


async def test_list_questions_filters_by_role(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    await _seed_questions(db_session)
    user = register_user()

    response = client.get(
        "/v1/questions",
        params={"role": "backend"},
        headers={"Authorization": f"Bearer {user['access_token']}"},
    )

    assert response.status_code == 200
    roles = [q["role"] for q in response.json()]
    assert roles == ["backend", "backend"]


async def test_list_questions_filters_by_difficulty(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    await _seed_questions(db_session)
    user = register_user()

    response = client.get(
        "/v1/questions",
        params={"role": "backend", "difficulty": "hard"},
        headers={"Authorization": f"Bearer {user['access_token']}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["difficulty"] == "hard"


async def test_list_questions_excludes_inactive_questions(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    # backend+easy has one active question (REST vs GraphQL) and one inactive one (seeded
    # with is_active=False below) — only the active one should come back.
    await _seed_questions(db_session)
    user = register_user()

    response = client.get(
        "/v1/questions",
        params={"role": "backend", "difficulty": "easy"},
        headers={"Authorization": f"Bearer {user['access_token']}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["text"] == "What's the difference between REST and GraphQL?"


def test_list_questions_requires_auth(client: TestClient) -> None:
    response = client.get("/v1/questions", params={"role": "backend"})

    assert response.status_code == 401


def test_list_questions_requires_role(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.get(
        "/v1/questions", headers={"Authorization": f"Bearer {user['access_token']}"}
    )

    assert response.status_code == 422
