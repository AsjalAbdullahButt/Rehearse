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


# ─── database TLS ────────────────────────────────────────────────────────

_MYSQL_URL = "mysql+aiomysql://user:pw@db.example.com:3306/rehearse"
_PROXY_SECRET = "p" * 48


def _production_with_mysql(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DATABASE_URL", _MYSQL_URL)
    monkeypatch.setenv("INTERNAL_PROXY_SECRET", _PROXY_SECRET)


def test_database_tls_defaults_on_in_production_and_off_elsewhere(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _production_with_mysql(monkeypatch)
    assert Settings().database_tls_enabled is True  # pyright: ignore[reportCallIssue]

    monkeypatch.setenv("ENVIRONMENT", "development")
    assert Settings().database_tls_enabled is False  # pyright: ignore[reportCallIssue]


def test_production_refuses_to_start_with_database_tls_explicitly_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _production_with_mysql(monkeypatch)
    monkeypatch.setenv("DATABASE_TLS", "false")

    with pytest.raises(ValidationError, match="DATABASE_TLS must not be false"):
        Settings()  # pyright: ignore[reportCallIssue]


def test_database_tls_can_be_turned_off_outside_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "staging")
    monkeypatch.setenv("DATABASE_URL", _MYSQL_URL)
    monkeypatch.setenv("DATABASE_TLS", "false")

    settings = Settings()  # pyright: ignore[reportCallIssue]

    assert settings.database_tls_enabled is False
    assert settings.database_connect_args() == {}


def test_a_non_mysql_database_is_not_subject_to_the_tls_requirement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SECRET", _PROXY_SECRET)
    monkeypatch.setenv("DATABASE_TLS", "false")

    settings = Settings()  # pyright: ignore[reportCallIssue]  # conftest's SQLite URL

    assert settings.database_connect_args() == {}


def test_tls_connect_args_verify_the_certificate_and_hostname(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import ssl

    _production_with_mysql(monkeypatch)

    args = Settings().database_connect_args()  # pyright: ignore[reportCallIssue]

    context = args["ssl"]
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True


def test_a_missing_ca_bundle_fails_loudly_rather_than_skipping_verification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _production_with_mysql(monkeypatch)
    monkeypatch.setenv("DATABASE_SSL_CA", "/definitely/not/a/real/ca.pem")

    with pytest.raises(OSError):
        Settings().database_connect_args()  # pyright: ignore[reportCallIssue]
