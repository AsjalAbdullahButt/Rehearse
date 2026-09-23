"""Data-access layer. Every read/write that touches another user's rows must filter by
user_id here — MySQL has no Postgres-RLS equivalent, so this module is the only place a
cross-user data leak can be caught before it ships. See tests/test_cross_user_authorization.py."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.base import utcnow
from app.models.enums import Difficulty
from app.models.interview_session import InterviewSession
from app.models.profile import Profile
from app.models.refresh_token import RefreshToken
from app.models.user import User

# ─── users ───────────────────────────────────────────────────────────────


async def get_user_by_email(db: AsyncSession, *, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, *, user_id: str) -> User | None:
    return await db.get(User, user_id)


async def create_user(
    db: AsyncSession, *, email: str, password_hash: str, display_name: str | None = None
) -> User:
    user = User(email=email, password_hash=password_hash)
    db.add(user)
    await db.flush()

    db.add(Profile(id=user.id, display_name=display_name))

    await db.commit()
    await db.refresh(user)
    return user


# ─── refresh tokens ──────────────────────────────────────────────────────


async def store_refresh_token(
    db: AsyncSession, *, user_id: str, token_hash: str, expires_at: datetime
) -> RefreshToken:
    row = RefreshToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_active_refresh_token(db: AsyncSession, *, token_hash: str) -> RefreshToken | None:
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash, RefreshToken.revoked_at.is_(None)
        )
    )
    return result.scalar_one_or_none()


async def revoke_refresh_token(db: AsyncSession, *, token_hash: str) -> None:
    row = await get_active_refresh_token(db, token_hash=token_hash)
    if row is not None:
        row.revoked_at = utcnow()
        await db.commit()


# ─── sessions ────────────────────────────────────────────────────────────


async def create_session(
    db: AsyncSession, *, user_id: str, role: str, difficulty: Difficulty
) -> InterviewSession:
    session = InterviewSession(user_id=user_id, role=role, difficulty=difficulty)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def get_session_for_user(
    db: AsyncSession, *, session_id: str, user_id: str
) -> InterviewSession | None:
    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id, InterviewSession.user_id == user_id
        )
    )
    return result.scalar_one_or_none()


async def list_sessions_for_user(db: AsyncSession, *, user_id: str) -> list[InterviewSession]:
    result = await db.execute(
        select(InterviewSession)
        .where(InterviewSession.user_id == user_id)
        .order_by(InterviewSession.started_at.desc())
    )
    return list(result.scalars().all())


# ─── answers ─────────────────────────────────────────────────────────────


async def create_answer(db: AsyncSession, *, answer: Answer) -> Answer:
    db.add(answer)
    await db.commit()
    await db.refresh(answer)
    return answer


async def get_answer_for_user(db: AsyncSession, *, answer_id: str, user_id: str) -> Answer | None:
    result = await db.execute(
        select(Answer).where(Answer.id == answer_id, Answer.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_answers_for_user(db: AsyncSession, *, user_id: str) -> list[Answer]:
    result = await db.execute(
        select(Answer).where(Answer.user_id == user_id).order_by(Answer.created_at.desc())
    )
    return list(result.scalars().all())
