import logging
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    check_token_version,
    decode_token,
    dummy_password_hash,
    get_current_user,
    hash_password,
    hash_token,
    issue_access_token,
    issue_refresh_token,
    verify_password,
)
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.rate_limit import client_ip_key, enforce_rate_limit
from app.db import get_db
from app.models.base import utcnow
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserPublic,
)
from app.services import repo

router = APIRouter()
logger = logging.getLogger("rehearse.api")


async def _issue_token_pair(
    db: AsyncSession, user: User, *, family_id: str | None = None
) -> TokenResponse:
    """`family_id` is omitted for a fresh login/register (starts a new lineage) and passed
    through on every rotation, so every token descended from one login shares an id — see
    refresh()'s docstring for what that's for."""
    settings = get_settings()
    access_token = issue_access_token(user.id, user.token_version)
    refresh_token = issue_refresh_token(user.id, user.token_version)

    await repo.store_refresh_token(
        db,
        user_id=user.id,
        family_id=family_id or str(uuid.uuid4()),
        token_hash=hash_token(refresh_token),
        expires_at=utcnow() + timedelta(days=settings.jwt_refresh_ttl_days),
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserPublic(id=user.id, email=user.email),
    )


@router.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request,
    response: Response,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    # Separate from (and tighter than) any per-user limit: keyed by IP since there's no
    # authenticated user yet at this point.
    await enforce_rate_limit(request, db, scope="register", limit=5, window_seconds=60)

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
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    # Two independent buckets: IP (catches one attacker trying many accounts) and normalized
    # email (catches many IPs/a botnet trying one account — credential stuffing/password
    # spraying against a single victim). Both are ordinary time-windowed throttles, not a
    # lockout — a failed login never disables the account itself, so an attacker can't grief a
    # real user out of their own account just by deliberately failing logins against it.
    await enforce_rate_limit(request, db, scope="login_ip", limit=10, window_seconds=60)
    await enforce_rate_limit(
        request,
        db,
        scope="login_email",
        limit=10,
        window_seconds=60,
        key_func=lambda _req: f"email:{body.email}",
    )

    user = await repo.get_user_by_email(db, email=body.email)
    # Argon2-verify against something either way — a real hash when the user exists, a fixed
    # dummy one when they don't — so "email not found" and "email found, wrong password" cost
    # roughly the same wall-clock time. Skipping verify_password entirely for an unknown email
    # would make the two cases distinguishable by response latency alone.
    password_ok = verify_password(
        body.password, user.password_hash if user is not None else dummy_password_hash()
    )
    if user is None or not password_ok:
        raise ApiError(
            "invalid_credentials",
            "Incorrect email or password.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    return await _issue_token_pair(db, user)


REFRESH_REUSE_GRACE_PERIOD_S = 5
"""How long after a token is rotated a replay of it is treated as a benign concurrent-tab race
rather than theft. Deliberately short: a real attacker racing a stolen token against the
legitimate rotation inside this window could hijack the session instead of tripping reuse
detection (see refresh()'s docstring) — an accepted, documented tradeoff of grace-period
rotation (the same shape as e.g. Auth0's "reuse interval"), not an oversight. Widening this
value trades more tolerance for slow/racy clients against a wider hijack window."""


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh(
    request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db)
) -> TokenResponse:
    """Rotation race strategy — two browser tabs share one httpOnly refresh-token cookie, so
    two near-simultaneous refreshes (e.g. both tabs loading a guarded page at once) can easily
    present the *same* token. Naively, whichever request loses that race would see the token
    already revoked by the winner and — correctly, in the real-theft case — nuke every session
    for the user. That's a false positive here, not an attack, so two things prevent it:

    1. `get_refresh_token_by_hash_for_update` locks the row for this transaction. If both
       requests really do race on the identical token, the second one's read blocks until the
       first commits its rotation, so it can never independently observe `revoked_at IS NULL`
       and rotate a second time from the same starting point.
    2. Once a request does see an already-revoked token, `family_id` (shared by every token
       descended from one login through rotation) is what tells "a sibling request rotated this
       a moment ago" apart from "replayed long after — real reuse": within
       REFRESH_REUSE_GRACE_PERIOD_S, it looks up the family's current active token and rotates
       from *that* instead of raising, so the losing tab still ends up with a valid session.
       Outside the grace period — or if no active token is left in the family even though the
       rotation was recent (an ambiguous case: a third concurrent loser, or a logout that
       happened at the same moment) — this still revokes every token for the user and forces
       re-authentication everywhere, exactly as before.
    """
    # IP-keyed, not user-keyed: the caller isn't authenticated yet at this point (that's the
    # whole point of this endpoint), so there's no user identity to key on other than by first
    # decoding the token — and a request bearing an invalid token should still be throttled, not
    # given a free decode attempt. A generous limit: legitimate multi-tab usage can trigger
    # several refreshes close together (see the docstring above), so this only needs to catch a
    # genuine hammering pattern, not ordinary concurrent-tab behavior.
    await enforce_rate_limit(
        request, db, scope="refresh", limit=20, window_seconds=60, key_func=client_ip_key
    )

    payload = decode_token(body.refresh_token, expected_type="refresh")
    token_hash = hash_token(body.refresh_token)

    stored = await repo.get_refresh_token_by_hash_for_update(db, token_hash=token_hash)
    if stored is None or stored.expires_at < utcnow():
        raise ApiError(
            "token_invalid",
            "Refresh token is invalid or has been revoked.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    if stored.revoked_at is not None:
        age_s = (utcnow() - stored.revoked_at).total_seconds()
        if age_s <= REFRESH_REUSE_GRACE_PERIOD_S:
            active = await repo.get_active_token_for_family(db, family_id=stored.family_id)
            if active is not None:
                user = await repo.get_user_by_id(db, user_id=active.user_id)
                if user is None:
                    raise ApiError(
                        "unauthorized",
                        "User no longer exists.",
                        status_code=status.HTTP_401_UNAUTHORIZED,
                    )
                check_token_version(payload, user)
                await repo.revoke_refresh_token(db, token_hash=active.token_hash)
                return await _issue_token_pair(db, user, family_id=active.family_id)
            # Recent rotation, but nothing active left in the family — ambiguous rather than a
            # clear theft signal (see docstring), so this just asks the client to retry/re-auth
            # instead of escalating to a full cross-device logout.
            raise ApiError(
                "token_invalid",
                "Refresh token is invalid or has been revoked.",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        # Rotated out well outside the grace period and replayed anyway — the standard signal
        # of a stolen refresh token being used, so every active token for this user is revoked,
        # forcing re-authentication everywhere rather than just rejecting this one request.
        logger.warning(
            "refresh_token_reuse_detected user_id=%s token_id=%s", stored.user_id, stored.id
        )
        await repo.revoke_all_refresh_tokens(db, user_id=stored.user_id)
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
    check_token_version(payload, user)

    # Rotate on every refresh: revoke the presented token, issue a brand new pair carrying the
    # same family_id forward.
    await repo.revoke_refresh_token(db, token_hash=token_hash)
    return await _issue_token_pair(db, user, family_id=stored.family_id)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: LogoutRequest, db: AsyncSession = Depends(get_db)) -> None:
    await repo.revoke_refresh_token(db, token_hash=hash_token(body.refresh_token))


@router.post("/auth/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> None:
    """Revokes every refresh token the current user has issued (every device/browser), not
    just the one presented — for a reported compromise or a "sign out everywhere" action.
    Also bumps token_version so any access token already issued to any device stops working
    immediately too, rather than staying valid until its own short TTL expires (see
    core/auth.py's check_token_version)."""
    await repo.revoke_all_refresh_tokens(db, user_id=user.id)
    await repo.increment_token_version(db, user_id=user.id)


@router.get("/auth/me", response_model=UserPublic)
async def me(user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic(id=user.id, email=user.email)


@router.post("/auth/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    if not verify_password(body.current_password, user.password_hash):
        raise ApiError(
            "invalid_credentials",
            "Current password is incorrect.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    await repo.update_user_password(
        db, user_id=user.id, password_hash=hash_password(body.new_password)
    )
    # Every refresh token dies, including this session's own, and token_version is bumped so
    # every access token already issued — including the one the caller used to authenticate this
    # very request — is rejected on its very next use (see core/auth.py's check_token_version).
    # A changed password now invalidates every credential immediately, not just refresh tokens
    # with a wait-out-the-TTL exception for access tokens.
    await repo.revoke_all_refresh_tokens(db, user_id=user.id)
    await repo.increment_token_version(db, user_id=user.id)


@router.delete("/auth/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    body: DeleteAccountRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Ownership is inherent — get_current_user resolves `user` from the caller's own access
    token, so this can only ever delete the caller's own account. The current password is still
    required as a confirmation step, given how irreversible this is."""
    if not verify_password(body.current_password, user.password_hash):
        raise ApiError(
            "invalid_credentials",
            "Current password is incorrect.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    await repo.delete_user_and_all_data(db, user_id=user.id)
