from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient


def _auth_headers(user: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {user['access_token']}"}


def test_create_session_returns_the_new_session(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.post(
        "/v1/sessions",
        json={"role": "backend", "difficulty": "medium"},
        headers=_auth_headers(user),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "backend"
    assert body["difficulty"] == "medium"
    assert body["user_id"] == user["user"]["id"]


def test_create_session_requires_auth(client: TestClient) -> None:
    response = client.post("/v1/sessions", json={"role": "backend", "difficulty": "medium"})

    assert response.status_code == 401


def test_list_sessions_only_returns_the_callers_own_sessions(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user_a = register_user("a@example.com")
    user_b = register_user("b@example.com")

    client.post(
        "/v1/sessions",
        json={"role": "backend", "difficulty": "easy"},
        headers=_auth_headers(user_a),
    )
    client.post(
        "/v1/sessions",
        json={"role": "frontend", "difficulty": "easy"},
        headers=_auth_headers(user_b),
    )

    response = client.get("/v1/sessions", headers=_auth_headers(user_a))

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["role"] == "backend"
