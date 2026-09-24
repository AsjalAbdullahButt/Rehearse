from datetime import timedelta

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    decode_token,
    get_current_user,
    hash_password,
    hash_token,
    issue_access_token,
    issue_refresh_token,
    verify_password,
)
from app.core.config import get_settings
from app.core.errors import ApiError
from app.db import get_db
from app.models.base import utcnow
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserPublic,
)
from app.services import repo

router = APIRouter()


async def _issue_token_pair(db: AsyncSession, user: User) -> TokenResponse:
    settings = get_settings()
    access_token = issue_access_token(user.id)
    refresh_token = issue_refresh_token(user.id)

    await repo.store_refresh_token(
        db,
        user_id=user.id,
        token_hash=hash_token(refresh_token),
        expires_at=utcnow() + timedelta(days=settings.jwt_refresh_ttl_days),
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserPublic(id=user.id, email=user.email),
    )


@router.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    existing = await repo.get_user_by_email(db, email=body.email)
    if existing is not None:
        raise ApiError(
            "email_taken",
            "An account with this email already exists.",
            status_code=status.HTTP_409_CONFLICT,
        )

    user = await repo.create_user(
        db,
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
    )
    return await _issue_token_pair(db, user)


@router.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = await repo.get_user_by_email(db, email=body.email)
    if user is None or not verify_password(body.password, user.password_hash):
        raise ApiError(
            "invalid_credentials",
            "Incorrect email or password.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    return await _issue_token_pair(db, user)


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    payload = decode_token(body.refresh_token, expected_type="refresh")
    token_hash = hash_token(body.refresh_token)

    stored = await repo.get_active_refresh_token(db, token_hash=token_hash)
    if stored is None or stored.expires_at < utcnow():
        raise ApiError(
            "token_invalid",
            "Refresh token is invalid or has been revoked.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    user = await repo.get_user_by_id(db, user_id=str(payload["sub"]))
    if user is None:
        raise ApiError(
            "unauthorized", "User no longer exists.", status_code=status.HTTP_401_UNAUTHORIZED
        )

    # Rotate on every refresh: revoke the presented token, issue a brand new pair. A stolen
    # refresh token that gets replayed after the legitimate client already rotated it will
    # find its hash already revoked.
    await repo.revoke_refresh_token(db, token_hash=token_hash)
    return await _issue_token_pair(db, user)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: LogoutRequest, db: AsyncSession = Depends(get_db)) -> None:
    await repo.revoke_refresh_token(db, token_hash=hash_token(body.refresh_token))


@router.post("/auth/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> None:
    """Revokes every refresh token the current user has issued (every device/browser), not
    just the one presented — for a reported compromise or a "sign out everywhere" action."""
    await repo.revoke_all_refresh_tokens(db, user_id=user.id)


@router.get("/auth/me", response_model=UserPublic)
async def me(user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic(id=user.id, email=user.email)
