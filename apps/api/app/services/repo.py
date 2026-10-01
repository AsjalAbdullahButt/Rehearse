"""Data-access layer. Every read/write that touches another user's rows must filter by
user_id here — MySQL has no Postgres-RLS equivalent, so this module is the only place a
cross-user data leak can be caught before it ships. See tests/test_cross_user_authorization.py."""

import random
import time
import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.answer import Answer
from app.models.base import utcnow
from app.models.candidate_competency import CandidateCompetency
from app.models.enums import (
    SESSION_STATUS_TRANSITIONS,
    Category,
    Difficulty,
    Focus,
    InterviewerStyle,
    Role,
    SessionStatus,
)
from app.models.interview_claim import InterviewClaim
from app.models.interview_session import InterviewSession
from app.models.job_target import JobCompetency, JobTarget
from app.models.profile import Profile
from app.models.question import Question
from app.models.rate_limit_counter import RateLimitCounter
from app.models.refresh_token import RefreshToken
from app.models.session_question import SessionQuestion
from app.models.user import User
from app.schemas.feedback import rubric_overall_score
from app.schemas.progress import ProgressRow
from app.services import metrics

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


async def update_user_password(db: AsyncSession, *, user_id: str, password_hash: str) -> None:
    await db.execute(update(User).where(User.id == user_id).values(password_hash=password_hash))
    await db.commit()


async def increment_token_version(db: AsyncSession, *, user_id: str) -> None:
    """Bumps User.token_version by one, invalidating every access/refresh JWT already issued to
    this user (see core/auth.py's check_token_version) — called by change-password and
    logout-all. `User.token_version + 1` (an in-DB expression) rather than reading-then-writing
    a Python int, so two near-simultaneous calls (e.g. a double-click) can't race and lose one
    of the increments."""
    await db.execute(
        update(User).where(User.id == user_id).values(token_version=User.token_version + 1)
    )
    await db.commit()


async def delete_user_and_all_data(db: AsyncSession, *, user_id: str) -> None:
    """Explicit, dependency-ordered deletes rather than relying solely on each table's
    ON DELETE CASCADE — that's still declared on every FK to users.id for defense in depth and
    to keep real MySQL consistent even if a row is ever deleted some other way, but SQLite (used
    in tests) doesn't enforce FK cascades unless PRAGMA foreign_keys is turned on per connection,
    which this codebase doesn't do — relying on cascade alone here would pass silently against
    MySQL while leaving orphaned rows undetected in SQLite tests. Answers are deleted before
    their session (rather than trusting the session's own cascade) for the same reason."""
    await db.execute(delete(Answer).where(Answer.user_id == user_id))
    await db.execute(delete(InterviewSession).where(InterviewSession.user_id == user_id))
    await db.execute(delete(InterviewClaim).where(InterviewClaim.user_id == user_id))
    await db.execute(delete(CandidateCompetency).where(CandidateCompetency.user_id == user_id))
    target_ids = select(JobTarget.id).where(JobTarget.user_id == user_id)
    await db.execute(delete(JobCompetency).where(JobCompetency.job_target_id.in_(target_ids)))
    await db.execute(delete(JobTarget).where(JobTarget.user_id == user_id))
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
    await db.execute(delete(Profile).where(Profile.id == user_id))
    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()


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
    db: AsyncSession, *, user_id: str, family_id: str, token_hash: str, expires_at: datetime
) -> RefreshToken:
    row = RefreshToken(
        user_id=user_id, family_id=family_id, token_hash=token_hash, expires_at=expires_at
    )
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


async def get_refresh_token_by_hash_for_update(
    db: AsyncSession, *, token_hash: str
) -> RefreshToken | None:
    """Like get_refresh_token_by_hash, but with a locking read (SELECT ... FOR UPDATE) — see
    count_answers_today's docstring for how this closes a TOCTOU gap on MySQL/InnoDB. Here it
    means two requests racing on the *identical* token hash can't both independently observe
    `revoked_at IS NULL` and both rotate it: the second blocks until the first's transaction
    commits, then re-reads and correctly sees the now-revoked row. SQLite (tests) compiles FOR
    UPDATE away entirely — same caveat as count_answers_today, exercised there for real only
    against MySQL in CI."""
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update()
    )
    return result.scalar_one_or_none()


async def get_active_token_for_family(db: AsyncSession, *, family_id: str) -> RefreshToken | None:
    """The current, not-yet-rotated token for a lineage — used by refresh()'s grace-period path
    to recover a losing concurrent request instead of revoking the whole family. Also a locking
    read, for the same reason as get_refresh_token_by_hash_for_update: two losing requests
    racing each other in the grace-period path must not both rotate this same row."""
    result = await db.execute(
        select(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .with_for_update()
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

# In-process TTL cache: the question bank changes rarely (a seed script, not user writes) but
# is read on every interview setup. Instance-local like the rate limiter in core/rate_limit.py
# — a cold-started serverless invocation just starts with an empty cache rather than a stale
# one, so there's nothing to invalidate on write. `Question` rows are plain columns with no
# lazy-loaded relationships, so caching the ORM instances themselves (rather than re-fetching
# after the owning session closes) is safe.
_QUESTIONS_CACHE_TTL_S = 300.0
_QuestionsCacheKey = tuple[Role, Difficulty | None, Category | None]
_questions_cache: dict[_QuestionsCacheKey, tuple[float, list[Question]]] = {}


def clear_questions_cache() -> None:
    """Exposed for tests, where the cache would otherwise leak seeded rows from one test's
    throwaway DB into another's assertions (see conftest.py's autouse reset fixture)."""
    _questions_cache.clear()


async def list_questions(
    db: AsyncSession,
    *,
    role: Role,
    difficulty: Difficulty | None = None,
    category: Category | None = None,
) -> list[Question]:
    cache_key = (role, difficulty, category)
    cached = _questions_cache.get(cache_key)
    if cached is not None and time.monotonic() - cached[0] < _QUESTIONS_CACHE_TTL_S:
        return cached[1]

    query = select(Question).where(Question.role == role, Question.is_active.is_(True))
    if difficulty is not None:
        query = query.where(Question.difficulty == difficulty)
    if category is not None:
        query = query.where(Question.category == category)

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
    db: AsyncSession,
    *,
    user_id: str,
    role: str,
    difficulty: Difficulty,
    role_title: str | None = None,
    job_target_id: str | None = None,
    experience_level: str | None = None,
    focus: Focus = Focus.MIXED,
    question_count: int = 5,
    answer_cap_s: int = 120,
    company: str | None = None,
    industry: str | None = None,
    job_description: str | None = None,
    candidate_background: str | None = None,
    skills: list[str] | None = None,
    focus_topics: list[str] | None = None,
    years_experience: int | None = None,
    interviewer_style: InterviewerStyle | None = None,
    language: str | None = None,
    panel: bool = False,
) -> InterviewSession:
    session = InterviewSession(
        user_id=user_id,
        role=role,
        role_title=role_title,
        job_target_id=job_target_id,
        difficulty=difficulty,
        experience_level=experience_level,
        focus=focus,
        question_count=question_count,
        answer_cap_s=answer_cap_s,
        company=company,
        industry=industry,
        job_description=job_description,
        candidate_background=candidate_background,
        skills=skills,
        focus_topics=focus_topics,
        years_experience=years_experience,
        interviewer_style=interviewer_style,
        language=language,
        panel=panel,
    )
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


async def delete_session_and_all_data(db: AsyncSession, *, session_id: str, user_id: str) -> bool:
    """Ownership-scoped: the WHERE on the session delete only ever matches a row that's both
    this id and this user's, so a caller can't delete someone else's session by guessing an id.
    Explicit dependent deletes first for the same reason as delete_user_and_all_data — SQLite
    (tests) doesn't enforce FK cascades unless PRAGMA foreign_keys is turned on, which this
    codebase doesn't do. Returns False (and deletes nothing) if the session doesn't exist or
    isn't this user's."""
    session = await get_session_for_user(db, session_id=session_id, user_id=user_id)
    if session is None:
        return False

    await db.execute(delete(Answer).where(Answer.session_id == session_id))
    await db.execute(delete(SessionQuestion).where(SessionQuestion.session_id == session_id))
    await db.execute(delete(InterviewClaim).where(InterviewClaim.session_id == session_id))
    await db.execute(delete(InterviewSession).where(InterviewSession.id == session_id))
    await db.commit()
    return True


async def transition_session_status(
    db: AsyncSession, *, session_id: str, new_status: SessionStatus
) -> bool:
    """Moves a session to a terminal state, but only along an edge in SESSION_STATUS_TRANSITIONS.
    The allowed-from check is part of the UPDATE's WHERE clause (not a read-then-write), so two
    racing requests can't both finish the same session. Returns whether a row actually changed."""
    allowed_from = [
        current for current, targets in SESSION_STATUS_TRANSITIONS.items() if new_status in targets
    ]
    result = await db.execute(
        update(InterviewSession)
        .where(InterviewSession.id == session_id, InterviewSession.status.in_(allowed_from))
        .values(status=new_status, ended_at=utcnow())
    )
    await db.commit()
    return bool(getattr(result, "rowcount", 0))


async def mark_session_completed(db: AsyncSession, *, session_id: str) -> None:
    await transition_session_status(db, session_id=session_id, new_status=SessionStatus.COMPLETED)


# ─── session questions ───────────────────────────────────────────────────


async def create_session_question(
    db: AsyncSession,
    *,
    session_id: str,
    sequence_number: int,
    text: str,
    category: Category,
    source: str,
    question_id: str | None = None,
    competency: str | None = None,
    level: int | None = None,
    selection_reason: str | None = None,
    claim_id: str | None = None,
    panelist: str | None = None,
) -> SessionQuestion:
    session_question = SessionQuestion(
        session_id=session_id,
        sequence_number=sequence_number,
        text=text,
        category=category,
        source=source,
        question_id=question_id,
        competency=competency,
        level=level,
        selection_reason=selection_reason,
        claim_id=claim_id,
        panelist=panelist,
    )
    db.add(session_question)
    if claim_id is not None:
        # Counted when the probe is *asked*, so an unanswered probe is never asked twice.
        await db.execute(
            update(InterviewClaim)
            .where(InterviewClaim.id == claim_id, InterviewClaim.session_id == session_id)
            .values(probe_count=InterviewClaim.probe_count + 1)
        )
    await db.execute(
        update(InterviewSession)
        .where(InterviewSession.id == session_id)
        .values(current_question_number=sequence_number)
    )
    await db.commit()
    await db.refresh(session_question)
    return session_question


async def get_session_question_for_session(
    db: AsyncSession, *, session_question_id: str, session_id: str
) -> SessionQuestion | None:
    """Scoped by session_id, not just its own id — the session itself is already scoped to the
    caller by get_session_for_user, so this transitively enforces ownership without a second
    join back to users."""
    result = await db.execute(
        select(SessionQuestion).where(
            SessionQuestion.id == session_question_id, SessionQuestion.session_id == session_id
        )
    )
    return result.scalar_one_or_none()


async def list_session_questions_for_session(
    db: AsyncSession, *, session_id: str
) -> list[SessionQuestion]:
    result = await db.execute(
        select(SessionQuestion)
        .where(SessionQuestion.session_id == session_id)
        .order_by(SessionQuestion.sequence_number)
    )
    return list(result.scalars().all())


async def get_used_bank_question_ids_for_session(db: AsyncSession, *, session_id: str) -> set[str]:
    """Bank question IDs already served in this session — the "no duplicate question in the
    same session" rule. Only meaningful for source=BANK rows; generated/follow-up questions
    have no question_id at all."""
    result = await db.execute(
        select(SessionQuestion.question_id).where(
            SessionQuestion.session_id == session_id, SessionQuestion.question_id.is_not(None)
        )
    )
    return {question_id for question_id in result.scalars().all() if question_id is not None}


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


async def get_answer_for_session_question(
    db: AsyncSession, *, session_question_id: str
) -> Answer | None:
    """Backs the "no double-answering the same question" check in answers.py — a session's
    questions are already scoped to their owning session/user by the time this is called."""
    result = await db.execute(
        select(Answer).where(
            Answer.session_question_id == session_question_id,
            Answer.original_answer_id.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def list_attempts(db: AsyncSession, *, original_answer_id: str, user_id: str) -> list[Answer]:
    """The original answer plus every retry of it, oldest first — owner-scoped."""
    result = await db.execute(
        select(Answer)
        .where(
            Answer.user_id == user_id,
            (Answer.id == original_answer_id) | (Answer.original_answer_id == original_answer_id),
        )
        .order_by(Answer.attempt_number)
    )
    return list(result.scalars().all())


async def list_answers_for_user(db: AsyncSession, *, user_id: str) -> list[Answer]:
    result = await db.execute(
        select(Answer)
        .where(Answer.user_id == user_id, Answer.original_answer_id.is_(None))
        .order_by(Answer.created_at.desc())
    )
    return list(result.scalars().all())


async def list_answers_for_session(db: AsyncSession, *, session_id: str) -> list[Answer]:
    result = await db.execute(
        select(Answer)
        .where(Answer.session_id == session_id, Answer.original_answer_id.is_(None))
        .order_by(Answer.created_at)
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
    answers_result = await db.execute(
        select(Answer).where(
            Answer.session_id.in_(session_ids), Answer.original_answer_id.is_(None)
        )
    )
    answers_by_session: dict[str, list[Answer]] = defaultdict(list)
    for answer in answers_result.scalars().all():
        answers_by_session[answer.session_id].append(answer)

    rows: list[ProgressRow] = []
    for session in sessions:
        answers = answers_by_session[session.id]

        overall_scores = [
            score
            for answer in answers
            if (score := rubric_overall_score(answer.rubric)) is not None
        ]

        scores_by_category: dict[str, list[float]] = defaultdict(list)
        for answer in answers:
            if answer.category is None:
                continue
            score = rubric_overall_score(answer.rubric)
            if score is not None:
                scores_by_category[answer.category].append(score)

        filler_rates = [
            metrics.filler_rate_per_100_words(answer.filler_count, len(answer.words))
            for answer in answers
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
                avg_overall_score=_avg(overall_scores),
                avg_filler_rate_per_100_words=_avg(filler_rates),
                category_scores={
                    category: score
                    for category, values in scores_by_category.items()
                    if (score := _avg(values)) is not None
                },
            )
        )
    return rows


# ─── rate limiting ───────────────────────────────────────────────────────


GLOBAL_RATE_LIMIT_CLEANUP_PROBABILITY = 0.02
"""~1 in 50 calls also runs a global sweep (see below) — frequent enough that the table stays
bounded under real traffic, rare enough that the extra DELETE isn't paid on every single hit."""

GLOBAL_RATE_LIMIT_RETENTION_S = 60 * 60
"""Comfortably above every window_seconds currently in use (all <= 3600s — see
app/routers/auth.py, app/routers/answers.py, app/routers/resume.py) — this is a dead-row safety
net, not a limit window, so it only needs to be *bigger* than the largest real window, not tight."""


def _rate_limit_dialect_is_mysql() -> bool:
    # Mirrors app/db.py's own dialect check (DATABASE_URL's scheme) rather than introspecting
    # the session's bind — cheap, and avoids any doubt about what AsyncSession.bind exposes.
    return get_settings().database_url.get_secret_value().startswith("mysql")


async def record_rate_limit_hit(
    db: AsyncSession, *, key: str, window_seconds: int
) -> tuple[int, int]:
    """Records one hit against `key`'s current fixed window and returns
    `(hits_in_this_window, seconds_until_the_window_resets)` — a durable, cross-instance rate
    limit backed by a real row, the same pattern count_answers_today uses for the daily answer
    cap.

    Concurrency safety: the increment is one atomic UPSERT statement (`INSERT ... ON DUPLICATE
    KEY UPDATE hits = hits + 1` on MySQL, `INSERT ... ON CONFLICT DO UPDATE` on the SQLite used
    in tests), serialized by the unique index on (key, window_start) — see
    RateLimitCounter's docstring for exactly what this does and doesn't guarantee (in particular:
    real atomicity per bucket, but a fixed rather than sliding window, so a burst straddling a
    window boundary can briefly exceed the configured limit). This replaces an earlier design
    that inserted a row and then ran a separate, unlocked SELECT COUNT(*) — two requests racing
    inside the same window could both read a count under the limit and both be let through.
    Commits immediately so the hit is counted even if the rest of the request goes on to fail or
    raise.

    Two layers of cleanup, both needed: the per-key-and-window row this function itself
    maintains only ever grows for keys that keep recurring, so a one-time visitor's bucket would
    otherwise sit in the table forever. The probabilistic global sweep catches those too,
    independent of whether their key ever recurs — a plain age-based DELETE, not a
    dialect-specific upsert, so it runs identically against the SQLite used in tests and the
    real MySQL used in production."""
    now = utcnow()
    epoch_s = int(now.replace(tzinfo=UTC).timestamp())
    bucket_start_epoch_s = (epoch_s // window_seconds) * window_seconds
    window_start = datetime.fromtimestamp(bucket_start_epoch_s, tz=UTC).replace(tzinfo=None)
    seconds_until_reset = window_seconds - (epoch_s - bucket_start_epoch_s)

    values = {"id": str(uuid.uuid4()), "key": key, "window_start": window_start, "hits": 1}
    if _rate_limit_dialect_is_mysql():
        insert_stmt = mysql_insert(RateLimitCounter).values(**values)
        upsert_stmt = insert_stmt.on_duplicate_key_update(
            hits=RateLimitCounter.hits + 1, updated_at=now
        )
    else:
        insert_stmt = sqlite_insert(RateLimitCounter).values(**values)
        upsert_stmt = insert_stmt.on_conflict_do_update(
            index_elements=[RateLimitCounter.key, RateLimitCounter.window_start],
            set_={"hits": RateLimitCounter.hits + 1, "updated_at": now},
        )
    await db.execute(upsert_stmt)

    hits_result = await db.execute(
        select(RateLimitCounter.hits).where(
            RateLimitCounter.key == key, RateLimitCounter.window_start == window_start
        )
    )
    hits = hits_result.scalar_one()

    if random.random() < GLOBAL_RATE_LIMIT_CLEANUP_PROBABILITY:
        cleanup_cutoff = now - timedelta(seconds=GLOBAL_RATE_LIMIT_RETENTION_S)
        await db.execute(
            delete(RateLimitCounter).where(RateLimitCounter.window_start < cleanup_cutoff)
        )

    await db.commit()
    return hits, seconds_until_reset


# ─── job targets & competency mastery ────────────────────────────────────


async def get_job_target_by_hash(
    db: AsyncSession, *, user_id: str, analysis_hash: str
) -> JobTarget | None:
    result = await db.execute(
        select(JobTarget).where(
            JobTarget.user_id == user_id, JobTarget.analysis_hash == analysis_hash
        )
    )
    return result.scalar_one_or_none()


async def create_job_target(
    db: AsyncSession, *, target: JobTarget, competencies: list[JobCompetency]
) -> JobTarget:
    db.add(target)
    await db.flush()
    for competency in competencies:
        competency.job_target_id = target.id
        db.add(competency)
    await db.commit()
    await db.refresh(target)
    return target


async def list_job_competencies(
    db: AsyncSession, *, job_target_id: str, user_id: str
) -> list[JobCompetency]:
    """Joined through JobTarget so a competency map is only ever readable by its owner."""
    result = await db.execute(
        select(JobCompetency)
        .join(JobTarget, JobTarget.id == JobCompetency.job_target_id)
        .where(JobCompetency.job_target_id == job_target_id, JobTarget.user_id == user_id)
        .order_by(JobCompetency.weight.desc(), JobCompetency.competency)
    )
    return list(result.scalars().all())


async def list_candidate_competencies(
    db: AsyncSession, *, user_id: str, role: str | None = None
) -> list[CandidateCompetency]:
    query = select(CandidateCompetency).where(CandidateCompetency.user_id == user_id)
    if role is not None:
        query = query.where(CandidateCompetency.role == role)
    result = await db.execute(query.order_by(CandidateCompetency.competency))
    return list(result.scalars().all())


async def get_candidate_competency(
    db: AsyncSession, *, user_id: str, role: str, competency: str
) -> CandidateCompetency | None:
    result = await db.execute(
        select(CandidateCompetency).where(
            CandidateCompetency.user_id == user_id,
            CandidateCompetency.role == role,
            CandidateCompetency.competency == competency,
        )
    )
    return result.scalar_one_or_none()


async def save_candidate_competency(
    db: AsyncSession, *, row: CandidateCompetency
) -> CandidateCompetency:
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_latest_job_target_id_for_role(
    db: AsyncSession, *, user_id: str, role: str
) -> str | None:
    """The job target of the user's most recent session for this role, if any session had one."""
    result = await db.execute(
        select(InterviewSession.job_target_id)
        .where(
            InterviewSession.user_id == user_id,
            InterviewSession.role == role,
            InterviewSession.job_target_id.is_not(None),
        )
        .order_by(InterviewSession.started_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


# ─── claims ──────────────────────────────────────────────────────────────


async def create_claims(db: AsyncSession, *, claims: list[InterviewClaim]) -> list[InterviewClaim]:
    if not claims:
        return []
    db.add_all(claims)
    await db.commit()
    for claim in claims:
        await db.refresh(claim)
    return claims


async def list_claims_for_session(
    db: AsyncSession, *, session_id: str, user_id: str
) -> list[InterviewClaim]:
    result = await db.execute(
        select(InterviewClaim)
        .where(InterviewClaim.session_id == session_id, InterviewClaim.user_id == user_id)
        .order_by(InterviewClaim.created_at, InterviewClaim.id)
    )
    return list(result.scalars().all())


async def list_claims_for_answer(
    db: AsyncSession, *, answer_id: str, user_id: str
) -> list[InterviewClaim]:
    result = await db.execute(
        select(InterviewClaim)
        .where(InterviewClaim.answer_id == answer_id, InterviewClaim.user_id == user_id)
        .order_by(InterviewClaim.created_at, InterviewClaim.id)
    )
    return list(result.scalars().all())


async def get_claim_for_user(
    db: AsyncSession, *, claim_id: str, user_id: str
) -> InterviewClaim | None:
    result = await db.execute(
        select(InterviewClaim).where(
            InterviewClaim.id == claim_id, InterviewClaim.user_id == user_id
        )
    )
    return result.scalar_one_or_none()


async def save_claim(db: AsyncSession, *, claim: InterviewClaim) -> InterviewClaim:
    db.add(claim)
    await db.commit()
    await db.refresh(claim)
    return claim
