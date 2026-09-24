"""Data-access layer. Every read/write that touches another user's rows must filter by
user_id here — MySQL has no Postgres-RLS equivalent, so this module is the only place a
cross-user data leak can be caught before it ships. See tests/test_cross_user_authorization.py."""

from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.base import utcnow
from app.models.enums import Difficulty, Role
from app.models.interview_session import InterviewSession
from app.models.profile import Profile
from app.models.question import Question
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.progress import ProgressRow

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


# ─── profiles ────────────────────────────────────────────────────────────


async def get_profile(db: AsyncSession, *, user_id: str) -> Profile | None:
    return await db.get(Profile, user_id)


async def update_profile(db: AsyncSession, *, user_id: str, updates: dict[str, Any]) -> Profile:
    profile = await db.get(Profile, user_id)
    if profile is None:
        # Every user gets a profile row at registration (create_user above) — this only
        # guards against that invariant somehow not holding, not an expected path.
        profile = Profile(id=user_id)
        db.add(profile)

    for field, value in updates.items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile


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


async def revoke_all_refresh_tokens(db: AsyncSession, *, user_id: str) -> None:
    """Backs "log out everywhere": revokes every still-active refresh token for a user in one
    statement, e.g. after a reported compromise (there's no password-reset flow yet to pair
    this with — see the known-gaps note in AGENTS.md)."""
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    await db.commit()


# ─── questions ───────────────────────────────────────────────────────────


async def list_questions(
    db: AsyncSession, *, role: Role, difficulty: Difficulty | None = None
) -> list[Question]:
    query = select(Question).where(Question.role == role, Question.is_active.is_(True))
    if difficulty is not None:
        query = query.where(Question.difficulty == difficulty)

    result = await db.execute(query)
    return list(result.scalars().all())


async def get_question_by_id(db: AsyncSession, *, question_id: str) -> Question | None:
    return await db.get(Question, question_id)


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


async def list_sessions_for_user(
    db: AsyncSession, *, user_id: str, limit: int = 20, offset: int = 0
) -> list[InterviewSession]:
    result = await db.execute(
        select(InterviewSession)
        .where(InterviewSession.user_id == user_id)
        .order_by(InterviewSession.started_at.desc())
        .limit(limit)
        .offset(offset)
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


async def count_answers_today(db: AsyncSession, *, user_id: str) -> int:
    """Backs the 30-answers/user/day rate limit. Counted from the `answers` table directly
    rather than a separate counter, so there's nothing to keep in sync or reset."""
    start_of_day = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    result = await db.execute(
        select(func.count())
        .select_from(Answer)
        .where(Answer.user_id == user_id, Answer.created_at >= start_of_day)
    )
    return result.scalar_one()


# ─── progress ────────────────────────────────────────────────────────────


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


async def get_progress_for_user(
    db: AsyncSession, *, user_id: str, limit: int = 20, offset: int = 0
) -> list[ProgressRow]:
    """Per-session aggregates, computed in Python rather than a dialect-specific JSON-column
    SQL query (MySQL's `->>` vs SQLite's `json_extract` in tests) — this project's scale
    doesn't need the query to do it, and the aggregation itself is a handful of pure-Python
    averages over each session's already-small answer list. Answers for every session on the
    page are fetched in one batched query (not one query per session) to avoid an N+1."""
    sessions = await list_sessions_for_user(db, user_id=user_id, limit=limit, offset=offset)
    if not sessions:
        return []

    session_ids = [session.id for session in sessions]
    answers_result = await db.execute(select(Answer).where(Answer.session_id.in_(session_ids)))
    answers_by_session: dict[str, list[Answer]] = defaultdict(list)
    for answer in answers_result.scalars().all():
        answers_by_session[answer.session_id].append(answer)

    rows: list[ProgressRow] = []
    for session in sessions:
        answers = answers_by_session[session.id]

        star_averages = [
            (star["situation"] + star["task"] + star["action"] + star["result"]) / 4
            for answer in answers
            if (star := answer.star) is not None
        ]

        rows.append(
            ProgressRow(
                session_id=session.id,
                role=session.role,
                difficulty=session.difficulty,
                started_at=session.started_at,
                answer_count=len(answers),
                avg_wpm=_avg([float(a.wpm) for a in answers]),
                avg_filler_count=_avg([float(a.filler_count) for a in answers]),
                avg_clarity=_avg([float(a.clarity) for a in answers if a.clarity is not None]),
                avg_star=_avg(star_averages),
            )
        )
    return rows
