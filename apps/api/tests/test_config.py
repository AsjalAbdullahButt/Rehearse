import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_settings_rejects_a_bare_wildcard_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", "*")

    with pytest.raises(ValidationError, match="ALLOWED_ORIGINS cannot include"):
        Settings()  # pyright: ignore[reportCallIssue]


def test_settings_rejects_a_wildcard_mixed_in_with_explicit_origins(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://example.com,*")

    with pytest.raises(ValidationError, match="ALLOWED_ORIGINS cannot include"):
        Settings()  # pyright: ignore[reportCallIssue]


def test_settings_accepts_explicit_origins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://example.com, http://localhost:3000")

    settings = Settings()  # pyright: ignore[reportCallIssue]

    assert settings.allowed_origins_list == ["https://example.com", "http://localhost:3000"]


def test_settings_rejects_a_short_jwt_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "too-short")

    with pytest.raises(ValidationError, match="JWT_SECRET must be at least"):
        Settings()  # pyright: ignore[reportCallIssue]


def test_settings_accepts_a_strong_jwt_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "a" * 40)

    settings = Settings()  # pyright: ignore[reportCallIssue]

    assert settings.jwt_secret.get_secret_value() == "a" * 40
