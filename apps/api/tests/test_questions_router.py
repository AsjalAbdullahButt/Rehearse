from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.enums import Category, Difficulty, Role
from app.models.question import Question
from app.services import repo


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


async def test_list_questions_serves_repeated_calls_from_cache(db_session: AsyncSession) -> None:
    db_session.add(
        Question(
            role=Role.BACKEND, difficulty=Difficulty.EASY, category=Category.TECHNICAL, text="Q1"
        )
    )
    await db_session.commit()

    first = await repo.list_questions(db_session, role=Role.BACKEND, difficulty=Difficulty.EASY)
    assert len(first) == 1

    # Added directly against the DB, bypassing the endpoint — a cache hit should not see it.
    db_session.add(
        Question(
            role=Role.BACKEND, difficulty=Difficulty.EASY, category=Category.TECHNICAL, text="Q2"
        )
    )
    await db_session.commit()

    second = await repo.list_questions(db_session, role=Role.BACKEND, difficulty=Difficulty.EASY)
    assert len(second) == 1


async def _seed_question(
    db_session: AsyncSession, *, role: Role, difficulty: Difficulty, text: str
) -> str:
    question = Question(role=role, difficulty=difficulty, category=Category.TECHNICAL, text=text)
    db_session.add(question)
    await db_session.commit()
    await db_session.refresh(question)
    return question.id


async def _record_answer(
    db_session: AsyncSession, *, user_id: str, session_id: str, question_id: str
) -> None:
    await repo.create_answer(
        db_session,
        answer=Answer(
            session_id=session_id,
            user_id=user_id,
            question_id=question_id,
            question_text="placeholder",
            transcript="placeholder",
            duration_s=10,
            wpm=100,
        ),
    )


async def test_list_questions_excludes_ones_the_user_already_answered(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    user_id = user["user"]["id"]
    seen_id = await _seed_question(
        db_session, role=Role.BACKEND, difficulty=Difficulty.EASY, text="Seen question"
    )
    unseen_id = await _seed_question(
        db_session, role=Role.BACKEND, difficulty=Difficulty.EASY, text="Unseen question"
    )
    session = await repo.create_session(
        db_session, user_id=user_id, role=Role.BACKEND, difficulty=Difficulty.EASY
    )
    await _record_answer(db_session, user_id=user_id, session_id=session.id, question_id=seen_id)

    response = client.get(
        "/v1/questions",
        params={"role": "backend", "difficulty": "easy"},
        headers={"Authorization": f"Bearer {user['access_token']}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert [q["id"] for q in body] == [unseen_id]


async def test_list_questions_recycles_the_full_pool_once_every_question_is_answered(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    user_id = user["user"]["id"]
    only_id = await _seed_question(
        db_session, role=Role.BACKEND, difficulty=Difficulty.EASY, text="Only question"
    )
    session = await repo.create_session(
        db_session, user_id=user_id, role=Role.BACKEND, difficulty=Difficulty.EASY
    )
    await _record_answer(db_session, user_id=user_id, session_id=session.id, question_id=only_id)

    response = client.get(
        "/v1/questions",
        params={"role": "backend", "difficulty": "easy"},
        headers={"Authorization": f"Bearer {user['access_token']}"},
    )

    # With no unanswered question left in this role/difficulty, the endpoint recycles the full
    # pool rather than dead-ending the interview flow with an empty response.
    assert response.status_code == 200
    body = response.json()
    assert [q["id"] for q in body] == [only_id]


async def test_list_questions_answered_in_a_different_difficulty_does_not_exclude(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    # Answering the "hard" pool must not deplete the "easy" pool for the same role — the two
    # are tracked independently.
    user = register_user()
    user_id = user["user"]["id"]
    hard_id = await _seed_question(
        db_session, role=Role.BACKEND, difficulty=Difficulty.HARD, text="Hard question"
    )
    easy_id = await _seed_question(
        db_session, role=Role.BACKEND, difficulty=Difficulty.EASY, text="Easy question"
    )
    session = await repo.create_session(
        db_session, user_id=user_id, role=Role.BACKEND, difficulty=Difficulty.HARD
    )
    await _record_answer(db_session, user_id=user_id, session_id=session.id, question_id=hard_id)

    response = client.get(
        "/v1/questions",
        params={"role": "backend", "difficulty": "easy"},
        headers={"Authorization": f"Bearer {user['access_token']}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert [q["id"] for q in body] == [easy_id]


def test_list_questions_requires_role(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.get(
        "/v1/questions", headers={"Authorization": f"Bearer {user['access_token']}"}
    )

    assert response.status_code == 422
