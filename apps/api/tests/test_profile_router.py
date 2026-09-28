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


def test_update_profile_accepts_a_valid_target_role(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.patch(
        "/v1/profile", json={"target_role": "backend"}, headers=_auth_headers(user)
    )

    assert response.status_code == 200
    assert response.json()["target_role"] == "backend"


def test_update_profile_rejects_a_target_role_outside_the_role_enum(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    """target_role must be one of the real Role values, not an arbitrary client-supplied
    string — otherwise a bogus value could round-trip back out through GET /v1/profile and
    break anything downstream that assumes it's always a valid Role (e.g. /interview's
    initialRole fallback)."""
    user = register_user()

    response = client.patch(
        "/v1/profile", json={"target_role": "astronaut"}, headers=_auth_headers(user)
    )

    assert response.status_code == 422


def test_update_profile_clears_target_role_with_an_explicit_null(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()
    client.patch("/v1/profile", json={"target_role": "backend"}, headers=_auth_headers(user))

    response = client.patch("/v1/profile", json={"target_role": None}, headers=_auth_headers(user))

    assert response.status_code == 200
    assert response.json()["target_role"] is None


def test_update_profile_rejects_a_display_name_over_the_column_length(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.patch(
        "/v1/profile", json={"display_name": "x" * 256}, headers=_auth_headers(user)
    )

    assert response.status_code == 422


def test_update_profile_rejects_a_voice_name_over_the_column_length(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.patch(
        "/v1/profile", json={"voice_name": "x" * 129}, headers=_auth_headers(user)
    )

    assert response.status_code == 422


def test_update_profile_trims_whitespace_from_display_name(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()

    response = client.patch(
        "/v1/profile", json={"display_name": "  Ada Lovelace  "}, headers=_auth_headers(user)
    )

    assert response.status_code == 200
    assert response.json()["display_name"] == "Ada Lovelace"


def test_update_profile_clears_display_name_with_a_whitespace_only_value(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()
    client.patch("/v1/profile", json={"display_name": "Ada"}, headers=_auth_headers(user))

    response = client.patch(
        "/v1/profile", json={"display_name": "   "}, headers=_auth_headers(user)
    )

    assert response.status_code == 200
    assert response.json()["display_name"] is None


def test_profiles_are_independent_per_user(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user_a = register_user("a@example.com")
    user_b = register_user("b@example.com")

    client.patch("/v1/profile", json={"answer_cap_s": 60}, headers=_auth_headers(user_a))

    response_b = client.get("/v1/profile", headers=_auth_headers(user_b))

    assert response_b.json()["answer_cap_s"] == 120  # unaffected by user A's update
