from functools import lru_cache
from typing import Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_JWT_SECRET_LENGTH = 32
"""A 256-bit HMAC key needs 32 bytes; using the string length as a cheap proxy for entropy
rejects obviously-weak secrets ("changeme", "secret", ...) without trying to actually measure
entropy. The README's generation command (secrets.token_urlsafe(64)) produces ~86 characters,
comfortably above this floor."""


class Settings(BaseSettings):
    """Environment configuration, validated at startup. Fails fast on a bad env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    groq_api_key: str = Field(alias="GROQ_API_KEY")
    groq_stt_model: str = Field(default="whisper-large-v3-turbo", alias="GROQ_STT_MODEL")
    groq_llm_model: str = Field(default="llama-3.3-70b-versatile", alias="GROQ_LLM_MODEL")

    database_url: SecretStr = Field(alias="DATABASE_URL")

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

    allowed_origins: str = Field(default="http://localhost:3000", alias="ALLOWED_ORIGINS")
    daily_answer_limit: int = Field(default=30, alias="DAILY_ANSWER_LIMIT")

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

    @model_validator(mode="after")
    def _reject_wildcard_origin_with_credentials(self) -> Self:
        # main.py's CORSMiddleware always sets allow_credentials=True. A wildcard origin
        # alongside credentials is invalid per the CORS spec — browsers reject it outright — so
        # Starlette's CORSMiddleware fails cryptically at request time (it still runs, but every
        # credentialed cross-origin request just breaks). Catching this at startup, with an
        # actionable message, beats debugging a silently-broken CORS response later.
        if "*" in self.allowed_origins_list:
            raise ValueError(
                "ALLOWED_ORIGINS cannot include '*': this API always sends "
                "Access-Control-Allow-Credentials: true, and browsers reject a wildcard "
                "Access-Control-Allow-Origin combined with credentials. List explicit origins "
                "instead, e.g. ALLOWED_ORIGINS=https://example.com,http://localhost:3000."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    # Required fields are populated from the environment at runtime by pydantic-settings;
    # pyright can't see that, since BaseSettings.__init__ is a normal BaseModel constructor.
    return Settings()  # pyright: ignore[reportCallIssue]
