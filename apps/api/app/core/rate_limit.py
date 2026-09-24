"""In-memory (per-process) rate limiting via slowapi. Deliberately not Redis-backed: this is
an MVP on Vercel's free tier, and each serverless invocation may be a fresh process anyway, so
a shared store would be the only way to make limits hold exactly across instances — flagged
here, not built, since it's a real limitation worth knowing rather than a silent gap (see
AGENTS.md's scaling note). The limiter still helps within a warm, reused instance, and the
30/user/day business-rule cap in routers/answers.py (backed by the `answers` table, not
in-memory) is unaffected by this either way."""

from fastapi import Request, status
from fastapi.responses import JSONResponse, Response
from jwt import PyJWTError
from jwt import decode as jwt_decode
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import get_settings

limiter = Limiter(key_func=get_remote_address, headers_enabled=True)


def user_or_ip_key(request: Request) -> str:
    """Keys a limit by the authenticated user rather than IP, for endpoints where that's the
    meaningful unit of abuse (e.g. answers cost real Groq usage per user, not per network).
    slowapi's key_func only ever sees the raw Request — FastAPI hasn't resolved
    `Depends(get_current_user)` yet at this point — so this reads the bearer token directly.
    A missing/invalid token falls back to the IP; `get_current_user` still separately rejects
    the request with 401, this only affects which bucket a request counts against."""
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
    return get_remote_address(request)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Same `{error:{code,message}}` shape as every other error response (core/errors.py),
    with the Retry-After/X-RateLimit-* headers slowapi computes from the limiter's own state."""
    response = JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={
            "error": {
                "code": "rate_limited",
                "message": "Too many requests. Please try again shortly.",
            }
        },
    )
    return limiter._inject_headers(  # pyright: ignore[reportPrivateUsage]
        response, request.state.view_rate_limit
    )
