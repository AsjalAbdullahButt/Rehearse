from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient


def _auth_headers(user: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {user['access_token']}"}


def test_get_profile_returns_defaults_after_registration(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.get("/v1/profile", headers=_auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["answer_cap_s"] == 120
    assert body["voice_rate"] == 1.0
    assert body["voice_name"] is None


def test_get_profile_requires_auth(client: TestClient) -> None:
    response = client.get("/v1/profile")

    assert response.status_code == 401


def test_update_profile_persists_changes(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.patch(
        "/v1/profile",
        json={"answer_cap_s": 60, "voice_name": "Google US English", "voice_rate": 1.25},
        headers=_auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["answer_cap_s"] == 60
    assert body["voice_name"] == "Google US English"
    assert body["voice_rate"] == 1.25

    # Persisted, not just echoed back.
    refetch = client.get("/v1/profile", headers=_auth_headers(user))
    assert refetch.json()["answer_cap_s"] == 60


def test_update_profile_leaves_omitted_fields_unchanged(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()
    client.patch("/v1/profile", json={"answer_cap_s": 300}, headers=_auth_headers(user))

    response = client.patch("/v1/profile", json={"voice_rate": 0.75}, headers=_auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["answer_cap_s"] == 300  # untouched by the second PATCH
    assert body["voice_rate"] == 0.75


def test_update_profile_rejects_invalid_answer_cap(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.patch("/v1/profile", json={"answer_cap_s": 90}, headers=_auth_headers(user))

    assert response.status_code == 422


def test_update_profile_rejects_out_of_range_voice_rate(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.patch("/v1/profile", json={"voice_rate": 3.0}, headers=_auth_headers(user))

    assert response.status_code == 422


def test_profiles_are_independent_per_user(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user_a = register_user("a@example.com")
    user_b = register_user("b@example.com")

    client.patch("/v1/profile", json={"answer_cap_s": 60}, headers=_auth_headers(user_a))

    response_b = client.get("/v1/profile", headers=_auth_headers(user_b))

    assert response_b.json()["answer_cap_s"] == 120  # unaffected by user A's update
