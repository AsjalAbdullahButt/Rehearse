from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.enums import Category, Difficulty, Role
from app.models.question import Question


def _auth_headers(user: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {user['access_token']}"}


async def _seed_question(
    db_session: AsyncSession,
    *,
    role: Role = Role.BACKEND,
    difficulty: Difficulty = Difficulty.MEDIUM,
) -> None:
    db_session.add(
        Question(role=role, difficulty=difficulty, category=Category.TECHNICAL, text="Q")
    )
    await db_session.commit()


def _create_session(
    client: TestClient, user: dict[str, Any], *, role: str = "backend", difficulty: str = "medium"
) -> str:
    response = client.post(
        "/v1/sessions",
        json={
            "role": role,
            "difficulty": difficulty,
            "experience_level": "mid",
            "focus": "technical",
            "question_count": 5,
            "answer_cap_s": 120,
        },
        headers=_auth_headers(user),
    )
    assert response.status_code == 201, response.text
    session_id: str = response.json()["id"]
    return session_id


async def test_progress_is_empty_for_a_new_user(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.get("/v1/progress", headers=_auth_headers(user))

    assert response.status_code == 200
    assert response.json() == {"sessions": []}


async def test_progress_aggregates_answers_per_session(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    await _seed_question(db_session)
    session_id = _create_session(client, user)

    word = {"word": "hi", "start": 0.0, "end": 0.1}
    db_session.add_all(
        [
            Answer(
                session_id=session_id,
                user_id=user["user"]["id"],
                category="behavioral",
                question_text="Q1",
                transcript="A1",
                words=[word] * 100,
                duration_s=60,
                wpm=100,
                filler_count=2,
                clarity=8,
                rubric={
                    "category": "behavioral",
                    "situation": 8,
                    "task": 8,
                    "action": 8,
                    "result": 8,
                },
            ),
            Answer(
                session_id=session_id,
                user_id=user["user"]["id"],
                category="behavioral",
                question_text="Q2",
                transcript="A2",
                words=[word] * 100,
                duration_s=80,
                wpm=120,
                filler_count=4,
                clarity=6,
                rubric={
                    "category": "behavioral",
                    "situation": 6,
                    "task": 6,
                    "action": 6,
                    "result": 6,
                },
            ),
        ]
    )
    await db_session.commit()

    response = client.get("/v1/progress", headers=_auth_headers(user))

    assert response.status_code == 200
    rows = response.json()["sessions"]
    assert len(rows) == 1
    row = rows[0]
    assert row["session_id"] == session_id
    assert row["answer_count"] == 2
    assert row["avg_wpm"] == 110.0
    assert row["avg_filler_count"] == 3.0
    assert row["avg_clarity"] == 7.0
    assert row["avg_overall_score"] == 7.0
    assert row["avg_filler_rate_per_100_words"] == 3.0
    assert row["category_scores"] == {"behavioral": 7.0}


async def test_progress_breaks_down_scores_by_category_within_one_session(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    """A mixed-focus session can have answers across multiple categories — the trend chart
    needs each category's own average, not one number that blends technical and behavioral
    scoring together."""
    user = register_user()
    await _seed_question(db_session)
    session_id = _create_session(client, user)

    db_session.add_all(
        [
            Answer(
                session_id=session_id,
                user_id=user["user"]["id"],
                category="behavioral",
                question_text="Q1",
                transcript="A1",
                duration_s=60,
                wpm=100,
                rubric={
                    "category": "behavioral",
                    "situation": 8,
                    "task": 8,
                    "action": 8,
                    "result": 8,
                },
            ),
            Answer(
                session_id=session_id,
                user_id=user["user"]["id"],
                category="technical",
                question_text="Q2",
                transcript="A2",
                duration_s=60,
                wpm=100,
                rubric={
                    "category": "technical",
                    "correctness": 4,
                    "depth": 4,
                    "tradeoffs": 4,
                    "communication": 4,
                },
            ),
        ]
    )
    await db_session.commit()

    response = client.get("/v1/progress", headers=_auth_headers(user))

    assert response.status_code == 200
    row = response.json()["sessions"][0]
    assert row["category_scores"] == {"behavioral": 8.0, "technical": 4.0}


async def test_progress_keeps_each_sessions_answers_separate(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    """Regression test for the batched-query rewrite of get_progress_for_user: answers must
    stay grouped by their own session_id, not bleed into another session's averages."""
    user = register_user()
    await _seed_question(db_session)

    session_ids = [_create_session(client, user) for _ in range(2)]

    db_session.add_all(
        [
            Answer(
                session_id=session_ids[0],
                user_id=user["user"]["id"],
                question_text="Q1",
                transcript="A1",
                duration_s=60,
                wpm=100,
                filler_count=0,
            ),
            Answer(
                session_id=session_ids[1],
                user_id=user["user"]["id"],
                question_text="Q2",
                transcript="A2",
                duration_s=60,
                wpm=200,
                filler_count=0,
            ),
        ]
    )
    await db_session.commit()

    response = client.get("/v1/progress", headers=_auth_headers(user))

    assert response.status_code == 200
    rows_by_session = {row["session_id"]: row for row in response.json()["sessions"]}
    assert rows_by_session[session_ids[0]]["avg_wpm"] == 100.0
    assert rows_by_session[session_ids[1]]["avg_wpm"] == 200.0


async def test_progress_only_includes_the_callers_own_sessions(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user_a = register_user("a@example.com")
    user_b = register_user("b@example.com")
    await _seed_question(db_session)

    _create_session(client, user_b)

    response = client.get("/v1/progress", headers=_auth_headers(user_a))

    assert response.status_code == 200
    assert response.json() == {"sessions": []}
