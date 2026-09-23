from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer


def _auth_headers(user: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {user['access_token']}"}


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

    session_response = client.post(
        "/v1/sessions",
        json={"role": "backend", "difficulty": "medium"},
        headers=_auth_headers(user),
    )
    session_id = session_response.json()["id"]

    db_session.add_all(
        [
            Answer(
                session_id=session_id,
                user_id=user["user"]["id"],
                question_text="Q1",
                transcript="A1",
                duration_s=60,
                wpm=100,
                filler_count=2,
                clarity=8,
                star={"situation": 8, "task": 8, "action": 8, "result": 8},
            ),
            Answer(
                session_id=session_id,
                user_id=user["user"]["id"],
                question_text="Q2",
                transcript="A2",
                duration_s=80,
                wpm=120,
                filler_count=4,
                clarity=6,
                star={"situation": 6, "task": 6, "action": 6, "result": 6},
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
    assert row["avg_star"] == 7.0


async def test_progress_only_includes_the_callers_own_sessions(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user_a = register_user("a@example.com")
    user_b = register_user("b@example.com")

    client.post(
        "/v1/sessions",
        json={"role": "backend", "difficulty": "easy"},
        headers=_auth_headers(user_b),
    )

    response = client.get("/v1/progress", headers=_auth_headers(user_a))

    assert response.status_code == 200
    assert response.json() == {"sessions": []}
