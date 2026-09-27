"""Server-side question selection and ordering for a multi-question interview session — the
browser never picks a question itself (no downloading the full bank and Math.random()).

Deliberately leans on the static question bank rather than the LLM: the only "adaptive"
question this generates is the LLM's own `follow_up_question`, already produced for free while
grading the *previous* answer (see app/services/llm.py) — this never spends an extra Groq call
just to pick a question, the same "avoid unnecessary LLM calls" principle the answer-evaluation
prompt already follows."""

import random

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Category, Focus, QuestionSource
from app.models.interview_session import InterviewSession
from app.models.question import Question
from app.services import repo

_MIXED_CATEGORY_CYCLE = (Category.BEHAVIORAL, Category.TECHNICAL, Category.SITUATIONAL)


class NoQuestionAvailableError(Exception):
    """Raised only when the bank has nothing at all for this role/difficulty and there's no
    LLM follow-up to fall back on (realistically: the very first question of a session whose
    role/difficulty pool is empty)."""


def category_for_position(focus: Focus, position: int) -> Category:
    """`position` is 1-indexed (a question's sequence_number). A mixed focus round-robins
    through all three categories so an 8-question mixed session doesn't front-load every
    behavioral question before touching technical or situational ones."""
    if focus != Focus.MIXED:
        return Category(focus.value)
    return _MIXED_CATEGORY_CYCLE[(position - 1) % len(_MIXED_CATEGORY_CYCLE)]


async def select_next_question(
    db: AsyncSession,
    *,
    session: InterviewSession,
    category: Category,
    prior_follow_up: str | None,
) -> tuple[str, QuestionSource, str | None]:
    """Returns (text, source, bank_question_id — only set for source=BANK).

    Prefers the bank; only uses the LLM's follow-up when the session actually has
    personalization context to act on (a generic bank question can't reflect a candidate's job
    description or background) — otherwise there's no reason to prefer a generated question
    over a perfectly good bank one just because one happens to be available.
    """
    has_personalization = bool(session.job_description or session.candidate_background)
    if has_personalization and prior_follow_up:
        return prior_follow_up, QuestionSource.FOLLOW_UP, None

    bank_question = await _pick_bank_question(db, session=session, category=category)
    if bank_question is not None:
        return bank_question.text, QuestionSource.BANK, bank_question.id

    if prior_follow_up:
        return prior_follow_up, QuestionSource.FOLLOW_UP, None

    raise NoQuestionAvailableError(
        f"No questions available for {session.role}/{session.difficulty}"
    )


async def _pick_bank_question(
    db: AsyncSession, *, session: InterviewSession, category: Category
) -> Question | None:
    used_ids = await repo.get_used_bank_question_ids_for_session(db, session_id=session.id)

    in_category = await repo.list_questions(
        db, role=session.role, difficulty=session.difficulty, category=category
    )
    pool = [q for q in in_category if q.id not in used_ids]
    if pool:
        return random.choice(pool)

    # This category is exhausted for this role/difficulty within this session — try any
    # category rather than dead-ending a mixed-focus session partway through.
    any_category = await repo.list_questions(db, role=session.role, difficulty=session.difficulty)
    pool = [q for q in any_category if q.id not in used_ids]
    if pool:
        return random.choice(pool)

    # The whole bank for this role/difficulty has been used in this session — a repeat is
    # better than failing outright, mirroring questions.py's existing recycle-when-exhausted
    # policy for the (now-legacy) client-driven selection path.
    if any_category:
        return random.choice(any_category)
    return None
