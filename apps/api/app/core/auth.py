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


def _encode_token(user_id: str, token_type: TokenType, ttl: timedelta) -> str:
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
    }
    return jwt.encode(
        payload, settings.jwt_secret.get_secret_value(), algorithm=settings.jwt_algorithm
    )


def issue_access_token(user_id: str) -> str:
    settings = get_settings()
    return _encode_token(user_id, "access", timedelta(minutes=settings.jwt_access_ttl_min))


def issue_refresh_token(user_id: str) -> str:
    settings = get_settings()
    return _encode_token(user_id, "refresh", timedelta(days=settings.jwt_refresh_ttl_days))


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

    return user
