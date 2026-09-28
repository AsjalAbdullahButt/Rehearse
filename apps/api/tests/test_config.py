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


def test_settings_rejects_an_unsupported_jwt_algorithm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_ALGORITHM", "RS256")

    with pytest.raises(ValidationError, match="JWT_ALGORITHM must be one of"):
        Settings()  # pyright: ignore[reportCallIssue]


def test_settings_rejects_the_none_algorithm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_ALGORITHM", "none")

    with pytest.raises(ValidationError, match="JWT_ALGORITHM must be one of"):
        Settings()  # pyright: ignore[reportCallIssue]


def test_settings_defaults_to_development_environment() -> None:
    settings = Settings()  # pyright: ignore[reportCallIssue]

    assert settings.environment == "development"
    assert settings.docs_enabled is True


def test_settings_disables_docs_in_production_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SECRET", "a" * 40)

    settings = Settings()  # pyright: ignore[reportCallIssue]

    assert settings.docs_enabled is False


def test_settings_allows_re_enabling_docs_in_production_explicitly(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SECRET", "a" * 40)
    monkeypatch.setenv("ENABLE_API_DOCS", "true")

    settings = Settings()  # pyright: ignore[reportCallIssue]

    assert settings.docs_enabled is True


def test_settings_requires_internal_proxy_secret_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("INTERNAL_PROXY_SECRET", raising=False)

    with pytest.raises(ValidationError, match="INTERNAL_PROXY_SECRET is required"):
        Settings()  # pyright: ignore[reportCallIssue]


def test_settings_rejects_a_weak_internal_proxy_secret_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SECRET", "too-short")

    with pytest.raises(ValidationError, match="INTERNAL_PROXY_SECRET must be at least"):
        Settings()  # pyright: ignore[reportCallIssue]


def test_settings_does_not_require_internal_proxy_secret_outside_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "staging")
    monkeypatch.delenv("INTERNAL_PROXY_SECRET", raising=False)

    settings = Settings()  # pyright: ignore[reportCallIssue]

    assert settings.internal_proxy_secret is None
