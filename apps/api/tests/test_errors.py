"""Regression coverage for core/errors.py's validation-error messages — previously every
422 collapsed to one blanket "The request could not be validated." with no way for a client
(e.g. the sign-in form) to tell the user what to actually fix."""

from fastapi.testclient import TestClient


def test_register_with_a_short_password_names_the_password_field(client: TestClient) -> None:
    response = client.post(
        "/v1/auth/register", json={"email": "user@example.com", "password": "short123"}
    )

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert "password" in body["error"]["message"]
    assert body["error"]["message"] != "The request could not be validated."


def test_register_with_a_common_password_surfaces_the_real_validator_message(
    client: TestClient,
) -> None:
    response = client.post(
        "/v1/auth/register",
        json={"email": "user@example.com", "password": "qwertyuiop12345"},
    )

    assert response.status_code == 422
    message = response.json()["error"]["message"]
    # The custom field_validator's own ValueError text, not pydantic's "Value error, " wrapper.
    assert "too common" in message
    assert not message.startswith("Value error,")


def test_register_with_a_malformed_email_names_the_email_field(client: TestClient) -> None:
    response = client.post(
        "/v1/auth/register",
        json={"email": "not-an-email", "password": "a genuinely long passphrase 2026"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["message"].startswith("email:")


def test_register_with_a_missing_field_names_it_without_a_body_prefix(
    client: TestClient,
) -> None:
    response = client.post("/v1/auth/register", json={"email": "user@example.com"})

    assert response.status_code == 422
    message = response.json()["error"]["message"]
    assert message.startswith("password:")
    assert "body" not in message
