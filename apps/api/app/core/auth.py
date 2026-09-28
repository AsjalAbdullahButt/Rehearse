import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHash, VerificationError, VerifyMismatchError
from fastapi import Depends, Header, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError
from app.db import get_db
from app.models.user import User

_password_hasher = PasswordHasher()

TokenType = Literal["access", "refresh"]

# Hashed once at import time so login() always has something to run Argon2 against, even when
# the email doesn't match any user — see dummy_password_hash()'s docstring.
_DUMMY_PASSWORD_HASH = _password_hasher.hash(secrets.token_urlsafe(32))


def dummy_password_hash() -> str:
    """A precomputed, never-matching Argon2 hash for login()'s timing defense: verifying against
    it costs the same as a real verification, so "email not found" and "email found, wrong
    password" take roughly the same time — without this, an attacker could distinguish the two
    by response latency alone (a real Argon2 verify vs. skipping it entirely) and use that to
    enumerate registered emails."""
    return _DUMMY_PASSWORD_HASH


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        _password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHash):
        return False
    return True


def hash_token(token: str) -> str:
    """Refresh tokens are stored hashed, same reasoning as passwords: a DB leak shouldn't
    hand out live credentials."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _encode_token(user_id: str, token_type: TokenType, ttl: timedelta, token_version: int) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
        "jti": secrets.token_hex(16),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        # Checked against the live User.token_version by get_current_user/refresh() — see their
        # docstrings. Defaults to 1 (User.token_version's own column default) so any caller that
        # hasn't been updated to pass a real value still issues a token that validates against a
        # freshly-created user.
        "ver": token_version,
    }
    return jwt.encode(
        payload, settings.jwt_secret.get_secret_value(), algorithm=settings.jwt_algorithm
    )


def issue_access_token(user_id: str, token_version: int = 1) -> str:
    settings = get_settings()
    return _encode_token(
        user_id, "access", timedelta(minutes=settings.jwt_access_ttl_min), token_version
    )


def issue_refresh_token(user_id: str, token_version: int = 1) -> str:
    settings = get_settings()
    return _encode_token(
        user_id, "refresh", timedelta(days=settings.jwt_refresh_ttl_days), token_version
    )


def decode_token(token: str, expected_type: TokenType) -> dict[str, str | int]:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            # Explicit allow-list: PyJWT will never fall back to accepting an unsigned
            # ("none" alg) token, even if a client tries to supply one.
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
    except jwt.ExpiredSignatureError as exc:
        raise ApiError(
            "token_expired", "Token has expired.", status_code=status.HTTP_401_UNAUTHORIZED
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise ApiError(
            "token_invalid", "Token is invalid.", status_code=status.HTTP_401_UNAUTHORIZED
        ) from exc

    if payload.get("type") != expected_type:
        raise ApiError(
            "token_invalid", "Token is invalid.", status_code=status.HTTP_401_UNAUTHORIZED
        )

    return payload


def try_decode_token(token: str, expected_type: TokenType) -> dict[str, str | int] | None:
    """Best-effort variant of decode_token for callers that need to degrade gracefully on an
    invalid/expired/wrong-type token rather than raise 401 themselves — e.g.
    app/core/rate_limit.py's user_or_ip_key, where a bad token should just fall back to IP-based
    keying and let get_current_user independently reject the request with 401. Reuses
    decode_token itself (signature, algorithm allow-list, issuer, audience, expiry, token type)
    rather than re-implementing any part of that validation."""
    try:
        return decode_token(token, expected_type)
    except ApiError:
        return None


def check_token_version(payload: dict[str, str | int], user: User) -> None:
    """Immediate session invalidation: password change / logout-all / a future compromise
    response bump User.token_version, which is baked into every token issued from that point on
    (see _encode_token's "ver" claim). A token minted before the bump still has a valid
    signature and hasn't expired, but its "ver" no longer matches the live row, so it's rejected
    here rather than trusted until its normal TTL runs out — closing the gap a refresh-token-only
    revocation list leaves for already-issued access tokens (which have no revocation list of
    their own)."""
    if payload.get("ver") != user.token_version:
        raise ApiError(
            "session_invalidated",
            "Your session is no longer valid. Please sign in again.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if authorization is None or not authorization.startswith("Bearer "):
        raise ApiError(
            "unauthorized",
            "Missing or malformed Authorization header.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    token = authorization.removeprefix("Bearer ").strip()
    payload = decode_token(token, expected_type="access")
    user_id = payload["sub"]

    user = await db.get(User, user_id)
    if user is None:
        raise ApiError(
            "unauthorized", "User no longer exists.", status_code=status.HTTP_401_UNAUTHORIZED
        )
    check_token_version(payload, user)

    return user
