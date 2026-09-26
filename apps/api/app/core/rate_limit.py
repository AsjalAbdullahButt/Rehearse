"""Durable, cross-instance rate limiting backed by MySQL (app/models/rate_limit_hit.py),
counted the same way repo.count_answers_today backs the daily answer cap. Replaces an earlier
in-memory (per-process) slowapi limiter that didn't hold across Vercel's serverless cold
starts — a fresh instance's empty in-memory state let a burst blow straight through the limit
right after a cold start. This is free-tier-friendly (no Redis/Upstash account needed) and
correct across instances, at the cost of one extra DB round trip per rate-limited request."""

from collections.abc import Callable

from fastapi import Request, status
from jwt import PyJWTError
from jwt import decode as jwt_decode
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError
from app.services.repo import record_rate_limit_hit


def user_or_ip_key(request: Request) -> str:
    """Keys a limit by the authenticated user rather than IP, for endpoints where that's the
    meaningful unit of abuse (e.g. answers cost real Groq usage per user, not per network).
    FastAPI hasn't resolved `Depends(get_current_user)` yet at the point this needs to run, so
    this reads the bearer token directly. A missing/invalid token falls back to the IP;
    `get_current_user` still separately rejects the request with 401 — this only affects which
    bucket a request counts against."""
    authorization = request.headers.get("Authorization", "")
    if authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        settings = get_settings()
        try:
            payload = jwt_decode(
                token,
                settings.jwt_secret.get_secret_value(),
                algorithms=[settings.jwt_algorithm],
            )
        except PyJWTError:
            payload = {}
        sub = payload.get("sub")
        if isinstance(sub, str):
            return f"user:{sub}"
    return client_ip_key(request)


def client_ip_key(request: Request) -> str:
    return f"ip:{request.client.host}" if request.client else "ip:unknown"


async def enforce_rate_limit(
    request: Request,
    db: AsyncSession,
    *,
    scope: str,
    limit: int,
    window_seconds: int,
    key_func: Callable[[Request], str] = client_ip_key,
) -> None:
    """Raises a 429 ApiError (with a Retry-After header) once more than `limit` requests for
    this scope+key land within the trailing `window_seconds`. Call this first, before any other
    validation, so every request against the endpoint counts — matching the earlier decorator's
    behavior of running before the handler body."""
    key = f"{scope}:{key_func(request)}"
    count = await record_rate_limit_hit(db, key=key, window_seconds=window_seconds)
    if count > limit:
        raise ApiError(
            "rate_limited",
            "Too many requests. Please try again shortly.",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(window_seconds)},
        )
