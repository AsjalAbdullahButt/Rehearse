import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.interview_session import InterviewSession
from app.models.profile import Profile
from app.models.user import User
from app.routers import auth as auth_router


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


def test_login_is_rate_limited_per_ip(client: TestClient) -> None:
    for _ in range(10):
        client.post(
            "/v1/auth/login", json={"email": "nobody@example.com", "password": "whatever-123"}
        )

    response = client.post(
        "/v1/auth/login", json={"email": "nobody@example.com", "password": "whatever-123"}
    )

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"
    assert "Retry-After" in response.headers


def test_register_is_rate_limited_per_ip(client: TestClient) -> None:
    for i in range(5):
        client.post(
            "/v1/auth/register",
            json={"email": f"flood{i}@example.com", "password": "correct-horse-battery-staple"},
        )

    response = client.post(
        "/v1/auth/register",
        json={"email": "one-more@example.com", "password": "correct-horse-battery-staple"},
    )

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"


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


def test_refresh_rotates_tokens(client: TestClient) -> None:
    body = _register(client)
    old_refresh_token = body["refresh_token"]

    response = client.post("/v1/auth/refresh", json={"refresh_token": old_refresh_token})

    assert response.status_code == 200
    new_tokens = response.json()
    assert new_tokens["access_token"] != body["access_token"]
    assert new_tokens["refresh_token"] != old_refresh_token


def test_replaying_a_just_rotated_token_within_the_grace_period_recovers_a_new_session(
    client: TestClient,
) -> None:
    """Two tabs sharing one refresh-token cookie can both fire a refresh at nearly the same
    moment; whichever one's request reaches the server second sees a token its sibling already
    rotated out. Within REFRESH_REUSE_GRACE_PERIOD_S, that's treated as this benign race rather
    than theft — the loser still gets a valid session instead of being reuse-detected into a
    full logout. See refresh()'s docstring in app/routers/auth.py."""
    body = _register(client)
    rotated_out_token = body["refresh_token"]

    winner = client.post("/v1/auth/refresh", json={"refresh_token": rotated_out_token})
    assert winner.status_code == 200
    winner_refresh_token = winner.json()["refresh_token"]

    loser = client.post("/v1/auth/refresh", json={"refresh_token": rotated_out_token})

    assert loser.status_code == 200
    loser_tokens = loser.json()
    # A fresh pair, distinct from both the original and the winner's — the loser is recovered
    # onto the family's current lineage, not handed back anything already issued.
    assert loser_tokens["refresh_token"] != rotated_out_token
    assert loser_tokens["refresh_token"] != winner_refresh_token

    # The very latest token in the family (the loser's) is still valid...
    still_valid = client.post(
        "/v1/auth/refresh", json={"refresh_token": loser_tokens["refresh_token"]}
    )
    assert still_valid.status_code == 200


def test_replaying_a_rotated_out_refresh_token_after_the_grace_period_revokes_everything(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Past the grace period, replaying an already-rotated-out token is the standard signal of
    token theft — the response is to revoke every refresh token for that user, not just the
    replayed one, so both the attacker's and the legitimate client's sessions are forced to
    re-authenticate."""
    # Negative, not 0 — a boundary of exactly 0 is a real flakiness risk: age_s (wall-clock
    # elapsed time between the rotation and the replay a couple of DB round trips later) could
    # legitimately compute to 0.0 on a fast run or a coarse system clock, landing this in the
    # grace-recovery branch by accident. Negative makes "outside grace" true for any realistic
    # positive elapsed time, however small.
    monkeypatch.setattr(auth_router, "REFRESH_REUSE_GRACE_PERIOD_S", -1)

    body = _register(client)
    rotated_out_token = body["refresh_token"]

    # A second, independent session for the same user (e.g. another device) — untouched by the
    # rotation below, so it's a control: it should only die from reuse detection, nothing else.
    second_login = client.post(
        "/v1/auth/login",
        json={"email": "user@example.com", "password": "correct-horse-battery-staple"},
    )
    other_session_token = second_login.json()["refresh_token"]

    rotate_response = client.post("/v1/auth/refresh", json={"refresh_token": rotated_out_token})
    current_token = rotate_response.json()["refresh_token"]

    replay = client.post("/v1/auth/refresh", json={"refresh_token": rotated_out_token})
    assert replay.status_code == 401

    # Both the just-issued token from the legitimate rotation and the unrelated second
    # session's token must now be dead too.
    current_now = client.post("/v1/auth/refresh", json={"refresh_token": current_token})
    assert current_now.status_code == 401
    other_now = client.post("/v1/auth/refresh", json={"refresh_token": other_session_token})
    assert other_now.status_code == 401


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


def test_register_normalizes_email_to_lowercase(client: TestClient) -> None:
    response = client.post(
        "/v1/auth/register",
        json={"email": "MixedCase@Example.com", "password": "correct-horse-battery-staple"},
    )

    assert response.status_code == 201
    assert response.json()["user"]["email"] == "mixedcase@example.com"


def test_login_is_case_insensitive_on_email(client: TestClient) -> None:
    _register(client, email="user@example.com")

    response = client.post(
        "/v1/auth/login",
        json={"email": "User@Example.com", "password": "correct-horse-battery-staple"},
    )

    assert response.status_code == 200


def test_register_rejects_a_duplicate_email_regardless_of_case(client: TestClient) -> None:
    _register(client, email="user@example.com")

    response = client.post(
        "/v1/auth/register",
        json={"email": "User@Example.com", "password": "another-password-123"},
    )

    assert response.status_code == 409


def test_change_password_requires_correct_current_password(client: TestClient) -> None:
    body = _register(client)

    response = client.post(
        "/v1/auth/change-password",
        json={"current_password": "wrong-password", "new_password": "a-new-password-456"},
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"


def test_change_password_requires_auth(client: TestClient) -> None:
    response = client.post(
        "/v1/auth/change-password",
        json={"current_password": "whatever", "new_password": "a-new-password-456"},
    )

    assert response.status_code == 401


def test_change_password_updates_credentials_and_revokes_refresh_tokens(
    client: TestClient,
) -> None:
    body = _register(client)
    old_refresh_token = body["refresh_token"]

    response = client.post(
        "/v1/auth/change-password",
        json={
            "current_password": "correct-horse-battery-staple",
            "new_password": "a-brand-new-password-789",
        },
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert response.status_code == 204

    old_login = client.post(
        "/v1/auth/login",
        json={"email": "user@example.com", "password": "correct-horse-battery-staple"},
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/v1/auth/login",
        json={"email": "user@example.com", "password": "a-brand-new-password-789"},
    )
    assert new_login.status_code == 200

    stale_refresh = client.post("/v1/auth/refresh", json={"refresh_token": old_refresh_token})
    assert stale_refresh.status_code == 401


def test_delete_account_requires_correct_password(client: TestClient) -> None:
    body = _register(client)

    response = client.request(
        "DELETE",
        "/v1/auth/me",
        json={"current_password": "wrong-password"},
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"


def test_delete_account_requires_auth(client: TestClient) -> None:
    response = client.request("DELETE", "/v1/auth/me", json={"current_password": "whatever"})

    assert response.status_code == 401


async def test_delete_account_removes_the_user_and_related_rows(
    client: TestClient, db_session: AsyncSession
) -> None:
    body = _register(client)
    user_id = body["user"]["id"]  # type: ignore[index]

    db_session.add(InterviewSession(user_id=user_id, role="backend", difficulty="medium"))
    await db_session.commit()

    response = client.request(
        "DELETE",
        "/v1/auth/me",
        json={"current_password": "correct-horse-battery-staple"},
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert response.status_code == 204

    # Old credentials no longer authenticate, and the previously-issued access token stops
    # working once the user row it points to is gone.
    login_attempt = client.post(
        "/v1/auth/login",
        json={"email": "user@example.com", "password": "correct-horse-battery-staple"},
    )
    assert login_attempt.status_code == 401
    me_attempt = client.get(
        "/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me_attempt.status_code == 401

    db_session.expire_all()
    assert (await db_session.execute(select(User).where(User.id == user_id))).first() is None
    assert (await db_session.execute(select(Profile).where(Profile.id == user_id))).first() is None
    session_count = (
        await db_session.execute(
            select(func.count())
            .select_from(InterviewSession)
            .where(InterviewSession.user_id == user_id)
        )
    ).scalar_one()
    assert session_count == 0
