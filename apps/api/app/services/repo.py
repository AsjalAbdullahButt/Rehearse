"""Data-access layer. Every read/write that touches another user's rows must filter by
user_id here — MySQL has no Postgres-RLS equivalent, so this module is the only place a
cross-user data leak can be caught before it ships. See tests/test_cross_user_authorization.py."""

import random
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.base import utcnow
from app.models.enums import Difficulty, Role
from app.models.interview_session import InterviewSession
from app.models.profile import Profile
from app.models.question import Question
from app.models.rate_limit_hit import RateLimitHit
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


async def get_refresh_token_by_hash(db: AsyncSession, *, token_hash: str) -> RefreshToken | None:
    """Unlike get_active_refresh_token, doesn't filter out an already-revoked row — the refresh
    endpoint needs to distinguish "never existed" from "presented again after being rotated
    out" (a signal of token theft) rather than treating both as the same generic invalid case."""
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
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

# In-process TTL cache: the question bank changes rarely (a seed script, not user writes) but
# is read on every interview setup. Instance-local like the rate limiter in core/rate_limit.py
# — a cold-started serverless invocation just starts with an empty cache rather than a stale
# one, so there's nothing to invalidate on write. `Question` rows are plain columns with no
# lazy-loaded relationships, so caching the ORM instances themselves (rather than re-fetching
# after the owning session closes) is safe.
_QUESTIONS_CACHE_TTL_S = 300.0
_questions_cache: dict[tuple[Role, Difficulty | None], tuple[float, list[Question]]] = {}


def clear_questions_cache() -> None:
    """Exposed for tests, where the cache would otherwise leak seeded rows from one test's
    throwaway DB into another's assertions (see conftest.py's autouse reset fixture)."""
    _questions_cache.clear()


async def list_questions(
    db: AsyncSession, *, role: Role, difficulty: Difficulty | None = None
) -> list[Question]:
    cache_key = (role, difficulty)
    cached = _questions_cache.get(cache_key)
    if cached is not None and time.monotonic() - cached[0] < _QUESTIONS_CACHE_TTL_S:
        return cached[1]

    query = select(Question).where(Question.role == role, Question.is_active.is_(True))
    if difficulty is not None:
        query = query.where(Question.difficulty == difficulty)

    result = await db.execute(query)
    questions = list(result.scalars().all())
    _questions_cache[cache_key] = (time.monotonic(), questions)
    return questions


async def get_question_by_id(db: AsyncSession, *, question_id: str) -> Question | None:
    return await db.get(Question, question_id)


async def get_answered_question_ids(
    db: AsyncSession, *, user_id: str, role: Role, difficulty: Difficulty | None = None
) -> set[str]:
    """IDs of questions this user has already answered, scoped to role (and difficulty, when
    given) so a completed "easy" pool doesn't affect "medium" availability. Used by the
    questions router to bias selection away from repeats on a second practice round — see its
    docstring for the recycle-when-exhausted fallback."""
    query = (
        select(Answer.question_id)
        .join(Question, Question.id == Answer.question_id)
        .where(Answer.user_id == user_id, Question.role == role)
        .distinct()
    )
    if difficulty is not None:
        query = query.where(Question.difficulty == difficulty)

    result = await db.execute(query)
    return {question_id for question_id in result.scalars().all() if question_id is not None}


# ─── sessions ────────────────────────────────────────────────────────────


async def create_session(
    db: AsyncSession, *, user_id: str, role: Role, difficulty: Difficulty
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


async def get_answer_by_idempotency_key(
    db: AsyncSession, *, user_id: str, idempotency_key: str, within_seconds: int
) -> Answer | None:
    """Backs POST /answers' idempotency support: a retry submitted with the same key (e.g.
    after a network drop hid a successful response from the client) returns the original
    answer instead of reprocessing — no duplicate Groq calls, no duplicate row against the
    daily cap. Scoped by user_id like every other lookup here, and to a trailing window so a
    key can't be replayed indefinitely."""
    window_start = utcnow() - timedelta(seconds=within_seconds)
    result = await db.execute(
        select(Answer).where(
            Answer.user_id == user_id,
            Answer.idempotency_key == idempotency_key,
            Answer.created_at >= window_start,
        )
    )
    return result.scalar_one_or_none()


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
    rather than a separate counter, so there's nothing to keep in sync or reset. A locking read
    (SELECT ... FOR UPDATE) closes the TOCTOU gap where two concurrent requests both read
    count=29, both pass the `< 30` check, and both insert: on MySQL/InnoDB (the real production
    dialect, default REPEATABLE READ), a range-predicate locking read like this takes next-key
    (gap) locks that block a concurrent transaction's INSERT into the same range too, not just
    reads of existing rows — so the second caller's own count read blocks until the first
    commits, and then sees the true, up-to-date count rather than a stale one. The caller must
    keep this call and the eventual INSERT in the same transaction (no commit in between) for
    the lock to still be held.

    SQLite (used in tests) has no row/range locking and compiles FOR UPDATE away entirely, so
    this can't be exercised as a true concurrency test without a real MySQL instance — the
    existing sequential daily-cap test still covers the counting logic itself."""
    start_of_day = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    result = await db.execute(
        select(func.count())
        .select_from(Answer)
        .where(Answer.user_id == user_id, Answer.created_at >= start_of_day)
        .with_for_update()
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


# ─── rate limiting ───────────────────────────────────────────────────────


GLOBAL_RATE_LIMIT_CLEANUP_PROBABILITY = 0.02
"""~1 in 50 calls also runs a global sweep (see below) — frequent enough that the table stays
bounded under real traffic, rare enough that the extra DELETE isn't paid on every single hit."""

GLOBAL_RATE_LIMIT_RETENTION_S = 60 * 60
"""Comfortably above every window_seconds currently in use (all <= 60s — see
app/routers/auth.py, app/routers/answers.py) — this is a dead-row safety net, not a limit
window, so it only needs to be *bigger* than the largest real window, not tight."""


async def record_rate_limit_hit(db: AsyncSession, *, key: str, window_seconds: int) -> int:
    """Records one hit for `key` and returns how many hits (including this one) fall within the
    trailing `window_seconds` — a durable, cross-instance rate limit backed by real rows, the
    same pattern count_answers_today uses for the daily answer cap. Commits immediately so the
    hit is counted even if the rest of the request goes on to fail or raise.

    Two layers of cleanup, both needed: the per-key delete below only ever runs when that same
    key is hit *again*, so a one-time visitor's row would otherwise sit in the table forever no
    matter how small its own window is. The probabilistic global sweep catches those too,
    independent of whether their key ever recurs — a plain age-based DELETE, not a
    dialect-specific upsert, so it runs identically against the SQLite used in tests and the
    real MySQL used in production."""
    now = utcnow()
    window_start = now - timedelta(seconds=window_seconds)

    db.add(RateLimitHit(key=key, created_at=now))
    count_result = await db.execute(
        select(func.count())
        .select_from(RateLimitHit)
        .where(RateLimitHit.key == key, RateLimitHit.created_at >= window_start)
    )
    count = count_result.scalar_one()

    await db.execute(
        delete(RateLimitHit).where(RateLimitHit.key == key, RateLimitHit.created_at < window_start)
    )

    if random.random() < GLOBAL_RATE_LIMIT_CLEANUP_PROBABILITY:
        cleanup_cutoff = now - timedelta(seconds=GLOBAL_RATE_LIMIT_RETENTION_S)
        await db.execute(delete(RateLimitHit).where(RateLimitHit.created_at < cleanup_cutoff))

    await db.commit()
    return count
