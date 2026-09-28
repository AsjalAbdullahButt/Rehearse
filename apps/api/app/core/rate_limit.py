"""Durable, cross-instance rate limiting backed by MySQL (app/models/rate_limit_counter.py),
using an atomically-upserted fixed-window counter per (scope+key) — see
repo.record_rate_limit_hit's docstring for the concurrency guarantee this does and doesn't make.
Replaces an earlier in-memory (per-process) slowapi limiter that didn't hold across Vercel's
serverless cold starts — a fresh instance's empty in-memory state let a burst blow straight
through the limit right after a cold start. This is free-tier-friendly (no Redis/Upstash account
needed) and correct across instances, at the cost of one extra DB round trip per rate-limited
request. If real production traffic ever needs a true distributed sliding-window limiter (not
just cross-instance correctness), the next step is a Redis/Upstash-backed atomic INCR+EXPIRE —
see AGENTS.md's production-hardening notes."""

import hmac
from collections.abc import Callable

from fastapi import Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import try_decode_token
from app.core.config import get_settings
from app.core.errors import ApiError
from app.services.repo import record_rate_limit_hit

# Must match apps/web/src/lib/auth/api.ts's header names exactly.
INTERNAL_PROXY_SECRET_HEADER = "X-Internal-Proxy-Secret"
INTERNAL_CLIENT_IP_HEADER = "X-Internal-Client-Ip"


def user_or_ip_key(request: Request) -> str:
    """Keys a limit by the authenticated user rather than IP, for endpoints where that's the
    meaningful unit of abuse (e.g. answers cost real Groq usage per user, not per network).
    FastAPI hasn't resolved `Depends(get_current_user)` yet at the point this needs to run, so
    this reads the bearer token directly — but validates it exactly the way get_current_user
    does (signature, algorithm allow-list, issuer, audience, expiration, and that it's an
    *access* token, not a refresh token) by going through core/auth.py's try_decode_token,
    rather than re-implementing a second, partial JWT-validation path here. Deliberately does
    NOT also check the token's "ver" claim against the live User.token_version (see
    core/auth.py's check_token_version) — that needs a DB lookup this function doesn't have, and
    a session invalidated by a password change is still a real, identifiable user for rate-limit
    bucketing purposes even though get_current_user will separately reject it with 401.

    A missing/invalid/expired/wrong-type token falls back to the IP; get_current_user still
    separately rejects the request with 401 either way — this only affects which bucket a
    request counts against, never authentication itself."""
    authorization = request.headers.get("Authorization", "")
    if authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        payload = try_decode_token(token, expected_type="access")
        if payload is not None:
            sub = payload.get("sub")
            if isinstance(sub, str):
                return f"user:{sub}"
    return client_ip_key(request)


def _trusted_forwarded_ip(request: Request) -> str | None:
    """Only trusts a caller-reported client IP when the request also carries the shared secret
    configured in settings.internal_proxy_secret — proving it was forwarded by our own Next.js
    BFF (the only other party who knows that secret), not sent directly by an arbitrary caller
    hitting the public API with a spoofed header. `hmac.compare_digest` avoids leaking the
    secret's value one byte at a time via a timing side channel on the comparison itself."""
    secret = get_settings().internal_proxy_secret
    if secret is None:
        return None
    provided = request.headers.get(INTERNAL_PROXY_SECRET_HEADER)
    if not provided or not hmac.compare_digest(provided, secret.get_secret_value()):
        return None
    forwarded_ip = request.headers.get(INTERNAL_CLIENT_IP_HEADER)
    return forwarded_ip.strip() if forwarded_ip and forwarded_ip.strip() else None


def client_ip_key(request: Request) -> str:
    trusted_ip = _trusted_forwarded_ip(request)
    if trusted_ip is not None:
        return f"ip:{trusted_ip}"
    # Direct API traffic (no proven BFF hop): the real connection IP is the only thing that
    # can't be spoofed by the caller, so it's used as-is rather than trusting any header.
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
    count, retry_after_s = await record_rate_limit_hit(db, key=key, window_seconds=window_seconds)
    if count > limit:
        raise ApiError(
            "rate_limited",
            "Too many requests. Please try again shortly.",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after_s)},
        )
