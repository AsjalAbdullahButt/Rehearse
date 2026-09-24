from fastapi.testclient import TestClient


def _register(client: TestClient, email: str = "user@example.com") -> dict[str, object]:
    response = client.post(
        "/v1/auth/register",
        json={"email": email, "password": "correct-horse-battery-staple", "display_name": "Ada"},
    )
    assert response.status_code == 201
    body: dict[str, object] = response.json()
    return body


def test_register_returns_token_pair(client: TestClient) -> None:
    body = _register(client)

    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["email"] == "user@example.com"  # type: ignore[index]


def test_register_rejects_duplicate_email(client: TestClient) -> None:
    _register(client)

    response = client.post(
        "/v1/auth/register",
        json={"email": "user@example.com", "password": "another-password-123"},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "email_taken"


def test_login_succeeds_with_correct_credentials(client: TestClient) -> None:
    _register(client)

    response = client.post(
        "/v1/auth/login",
        json={"email": "user@example.com", "password": "correct-horse-battery-staple"},
    )

    assert response.status_code == 200
    assert response.json()["access_token"]


def test_login_rejects_wrong_password(client: TestClient) -> None:
    _register(client)

    response = client.post(
        "/v1/auth/login", json={"email": "user@example.com", "password": "wrong-password"}
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"


def test_login_rejects_unknown_email(client: TestClient) -> None:
    response = client.post(
        "/v1/auth/login", json={"email": "nobody@example.com", "password": "whatever-123"}
    )

    assert response.status_code == 401


def test_me_requires_bearer_token(client: TestClient) -> None:
    response = client.get("/v1/auth/me")

    assert response.status_code == 401


def test_me_returns_current_user(client: TestClient) -> None:
    body = _register(client)

    response = client.get(
        "/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )

    assert response.status_code == 200
    assert response.json()["email"] == "user@example.com"


def test_refresh_rotates_tokens_and_invalidates_the_old_one(client: TestClient) -> None:
    body = _register(client)
    old_refresh_token = body["refresh_token"]

    response = client.post("/v1/auth/refresh", json={"refresh_token": old_refresh_token})
    assert response.status_code == 200
    new_tokens = response.json()
    assert new_tokens["access_token"] != body["access_token"]
    assert new_tokens["refresh_token"] != old_refresh_token

    replay = client.post("/v1/auth/refresh", json={"refresh_token": old_refresh_token})
    assert replay.status_code == 401


def test_logout_revokes_refresh_token(client: TestClient) -> None:
    body = _register(client)
    refresh_token = body["refresh_token"]

    logout_response = client.post("/v1/auth/logout", json={"refresh_token": refresh_token})
    assert logout_response.status_code == 204

    reuse_response = client.post("/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert reuse_response.status_code == 401


def test_logout_all_requires_auth(client: TestClient) -> None:
    response = client.post("/v1/auth/logout-all")

    assert response.status_code == 401


def test_logout_all_revokes_every_refresh_token(client: TestClient) -> None:
    body = _register(client)
    access_token = body["access_token"]
    first_refresh_token = body["refresh_token"]

    # A second login issues a second, independent refresh token for the same user/device.
    second_login = client.post(
        "/v1/auth/login",
        json={"email": "user@example.com", "password": "correct-horse-battery-staple"},
    )
    second_refresh_token = second_login.json()["refresh_token"]

    response = client.post(
        "/v1/auth/logout-all", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert response.status_code == 204

    first_reuse = client.post("/v1/auth/refresh", json={"refresh_token": first_refresh_token})
    assert first_reuse.status_code == 401
    second_reuse = client.post("/v1/auth/refresh", json={"refresh_token": second_refresh_token})
    assert second_reuse.status_code == 401
