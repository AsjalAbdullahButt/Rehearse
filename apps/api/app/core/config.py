from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    allowed_origins: str = Field(default="http://localhost:3000", alias="ALLOWED_ORIGINS")
    daily_answer_limit: int = Field(default=30, alias="DAILY_ANSWER_LIMIT")

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    # Required fields are populated from the environment at runtime by pydantic-settings;
    # pyright can't see that, since BaseSettings.__init__ is a normal BaseModel constructor.
    return Settings()  # pyright: ignore[reportCallIssue]
