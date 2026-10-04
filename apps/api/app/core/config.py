import ssl
from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_JWT_SECRET_LENGTH = 32
"""A 256-bit HMAC key needs 32 bytes; using the string length as a cheap proxy for entropy
rejects obviously-weak secrets ("changeme", "secret", ...) without trying to actually measure
entropy. The README's generation command (secrets.token_urlsafe(64)) produces ~86 characters,
comfortably above this floor."""

MIN_INTERNAL_PROXY_SECRET_LENGTH = 32
"""Same reasoning/floor as MIN_JWT_SECRET_LENGTH — this secret is what lets
app/core/rate_limit.py's client_ip_key trust a caller-reported IP, so a weak or guessable value
would defeat that trust boundary entirely."""

ALLOWED_JWT_ALGORITHMS = frozenset({"HS256", "HS384", "HS512"})
"""HMAC algorithms only — this project signs and verifies with one shared secret
(Settings.jwt_secret), not a public/private keypair, so an asymmetric algorithm (RS256, ES256,
...) would either fail outright or silently do the wrong thing depending on what's handed to it
as a "secret". Restricting to this allow-list, checked at startup, turns a misconfigured
JWT_ALGORITHM into an immediate, actionable startup failure instead of a confusing runtime one."""

Environment = Literal["development", "staging", "production"]


class Settings(BaseSettings):
    """Environment configuration, validated at startup. Fails fast on a bad env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    groq_api_key: str = Field(alias="GROQ_API_KEY")
    groq_stt_model: str = Field(default="whisper-large-v3-turbo", alias="GROQ_STT_MODEL")
    groq_llm_model: str = Field(default="openai/gpt-oss-120b", alias="GROQ_LLM_MODEL")
    """llama-3.3-70b-versatile (the original default) was retired from Groq's hosted catalog at
    some point after this project was first built — a request naming it now 404s at Groq, which
    services/llm.py surfaces as a generic "feedback model is unavailable" 502. Confirmed against
    a real Groq API key on 2026-09-29 via GET https://api.groq.com/openai/v1/models: this model
    id is live and supports response_format={"type": "json_object"} (llm.py's JSON mode), which
    every LLMFeedback/ResumeExtraction call here depends on. Groq's available model catalog
    changes over time independent of this codebase — if this default ever 404s again, check
    that endpoint again rather than guessing a replacement."""

    database_url: SecretStr = Field(alias="DATABASE_URL")

    environment: Environment = Field(default="development", alias="ENVIRONMENT")
    """Drives every other production-only check below (docs exposure, INTERNAL_PROXY_SECRET
    requirement, ...). Left as "development" by default so a fresh local/CI checkout doesn't
    need a new required env var just to boot — but every real deployment must set this
    explicitly; see docs/runbook.md."""

    database_tls: bool | None = Field(default=None, alias="DATABASE_TLS")
    """Encrypt the MySQL connection and verify the server's certificate. Unset means "on in
    production, off elsewhere" (local Docker MySQL has no certificate). Production refuses to
    start with this explicitly false — see `_enforce_production_requirements`. Has no effect on
    non-MySQL URLs (the SQLite used by tests)."""

    database_ssl_ca: str | None = Field(default=None, alias="DATABASE_SSL_CA")
    """Path to a CA bundle to verify the database server against — managed hosts such as Aiven
    sign with their own CA, which isn't in the system trust store. Unset uses the system store."""

    enable_api_docs: bool = Field(default=False, alias="ENABLE_API_DOCS")
    """/docs, /redoc and /openapi.json are always available outside production regardless of
    this flag (local dev / staging convenience). In production they're served only if this is
    explicitly set true — see `docs_enabled` below."""

    jwt_secret: SecretStr = Field(alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_access_ttl_min: int = Field(default=15, alias="JWT_ACCESS_TTL_MIN")
    jwt_refresh_ttl_days: int = Field(default=30, alias="JWT_REFRESH_TTL_DAYS")
    # Standard JWT claims (RFC 7519): who issued the token and who it's for. Validated on every
    # decode (see core/auth.py's decode_token) so a token from a differently-configured
    # deployment — or one crafted with a stolen secret but the wrong claims — is rejected even
    # if the signature happens to check out.
    jwt_issuer: str = Field(default="rehearse-api", alias="JWT_ISSUER")
    jwt_audience: str = Field(default="rehearse-web", alias="JWT_AUDIENCE")

    @field_validator("jwt_secret")
    @classmethod
    def _reject_weak_jwt_secret(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < MIN_JWT_SECRET_LENGTH:
            raise ValueError(
                f"JWT_SECRET must be at least {MIN_JWT_SECRET_LENGTH} characters. Generate one "
                'with: python -c "import secrets; print(secrets.token_urlsafe(64))"'
            )
        return value

    @field_validator("jwt_algorithm")
    @classmethod
    def _reject_unsupported_jwt_algorithm(cls, value: str) -> str:
        if value not in ALLOWED_JWT_ALGORITHMS:
            raise ValueError(
                f"JWT_ALGORITHM must be one of {sorted(ALLOWED_JWT_ALGORITHMS)} — this project "
                "signs and verifies with a single shared secret (JWT_SECRET), so an asymmetric "
                "algorithm isn't supported without deliberately migrating the signing scheme."
            )
        return value

    allowed_origins: str = Field(default="http://localhost:3000", alias="ALLOWED_ORIGINS")
    daily_answer_limit: int = Field(default=30, alias="DAILY_ANSWER_LIMIT")

    enable_camera_coach: bool = Field(default=False, alias="ENABLE_CAMERA_COACH")
    """Feature flag for the optional camera coach. Off by default: camera-derived summaries sent
    with an answer are ignored (not stored) and GET /v1/features reports it disabled."""

    enable_panel_interview: bool = Field(default=True, alias="ENABLE_PANEL_INTERVIEW")
    """Feature flag for panel interviews. Off: `panel: true` is rejected at session creation and
    GET /v1/features reports it disabled so the UI hides the option."""

    # Shared with the Next.js BFF (apps/web/src/lib/env.ts's INTERNAL_PROXY_SECRET). When set,
    # app/core/rate_limit.py trusts a caller-reported client IP only if the request also carries
    # this secret — proving it came through our own BFF rather than an arbitrary caller spoofing
    # a forwarded-for-style header directly against the public API. Left unset, the mechanism is
    # simply off and every request is keyed on its raw TCP connection IP (safe, just less
    # granular for traffic that actually did come through the BFF).
    internal_proxy_secret: SecretStr | None = Field(default=None, alias="INTERNAL_PROXY_SECRET")

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def docs_enabled(self) -> bool:
        """/docs, /redoc and /openapi.json expose the full API surface (every route, every
        schema) to anyone who can reach the deployment — fine as a local/staging convenience,
        not something a public production deployment should serve by default. See main.py's
        create_app, which wires this into FastAPI's docs_url/redoc_url/openapi_url."""
        return self.environment != "production" or self.enable_api_docs

    @model_validator(mode="after")
    def _reject_wildcard_origin_with_credentials(self) -> Self:
        # main.py's CORSMiddleware always sets allow_credentials=True. A wildcard origin
        # alongside credentials is invalid per the CORS spec — browsers reject it outright — so
        # Starlette's CORSMiddleware fails cryptically at request time (it still runs, but every
        # credentialed cross-origin request just breaks). Catching this at startup, with an
        # actionable message, beats debugging a silently-broken CORS response later.
        #
        # Browsers never call this API directly in this project's architecture — only the
        # Next.js BFF does, server-to-server (see AGENTS.md's proxy.ts notes) — so CORS here is
        # a defense-in-depth header, not the authentication boundary; get_current_user's JWT
        # check is. This validator still guards against a config that would silently break even
        # that defense-in-depth layer.
        if "*" in self.allowed_origins_list:
            raise ValueError(
                "ALLOWED_ORIGINS cannot include '*': this API always sends "
                "Access-Control-Allow-Credentials: true, and browsers reject a wildcard "
                "Access-Control-Allow-Origin combined with credentials. List explicit origins "
                "instead, e.g. ALLOWED_ORIGINS=https://example.com,http://localhost:3000."
            )
        return self

    @property
    def database_is_mysql(self) -> bool:
        return self.database_url.get_secret_value().startswith("mysql")

    @property
    def database_tls_enabled(self) -> bool:
        if self.database_tls is not None:
            return self.database_tls
        return self.environment == "production"

    def database_connect_args(self) -> dict[str, object]:
        """Driver arguments for the engine. With TLS on, a default SSL context: certificate
        and hostname are both verified, so a network attacker can't sit in the middle."""
        if not (self.database_is_mysql and self.database_tls_enabled):
            return {}
        return {"ssl": ssl.create_default_context(cafile=self.database_ssl_ca)}

    @model_validator(mode="after")
    def _enforce_production_requirements(self) -> Self:
        """Fails startup — not just a warning — on the specific misconfigurations that would
        otherwise only surface as a live security gap in a real deployment. Every check here is
        gated on environment=="production" specifically: development/staging keep today's
        permissive defaults (no INTERNAL_PROXY_SECRET required, docs on) so a fresh local
        checkout or a staging deploy doesn't need production-grade secrets just to boot."""
        if self.environment != "production":
            return self

        if self.database_is_mysql and not self.database_tls_enabled:
            raise ValueError(
                "DATABASE_TLS must not be false when ENVIRONMENT=production: the database holds "
                "transcripts, resumes and password hashes and must not travel unencrypted. Leave "
                "DATABASE_TLS unset (it defaults to on in production) and, if the host uses its "
                "own certificate authority, point DATABASE_SSL_CA at its CA bundle."
            )
        if self.internal_proxy_secret is None:
            raise ValueError(
                "INTERNAL_PROXY_SECRET is required when ENVIRONMENT=production: it's what lets "
                "app/core/rate_limit.py trust the Next.js BFF's forwarded client IP instead of "
                "falling back to treating every request as coming from one shared IP (the BFF's "
                "own outbound connection). Generate one with: "
                'python -c "import secrets; print(secrets.token_urlsafe(48))" and set the same '
                "value in the web app's INTERNAL_PROXY_SECRET."
            )
        if len(self.internal_proxy_secret.get_secret_value()) < MIN_INTERNAL_PROXY_SECRET_LENGTH:
            raise ValueError(
                f"INTERNAL_PROXY_SECRET must be at least {MIN_INTERNAL_PROXY_SECRET_LENGTH} "
                "characters in production."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    # Required fields are populated from the environment at runtime by pydantic-settings;
    # pyright can't see that, since BaseSettings.__init__ is a normal BaseModel constructor.
    return Settings()  # pyright: ignore[reportCallIssue]
