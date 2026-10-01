"""Server-side question selection for a multi-question interview — the browser never picks a
question itself.

Division of labour (see also app/services/adaptive_engine.py):
- the adaptive engine decides *what to test* — competency, difficulty level, mode — from the
  job's competency plan, the candidate's persistent mastery, and how the session is going;
- this module turns that decision into an actual question, preferring in order:
  1. the LLM follow-up already produced for free while grading the previous answer (only when
     the engine decided to probe the same competency further);
  2. a matching question from the static bank;
  3. a freshly generated question (bounded per session, so cost stays predictable);
  4. any unused bank question — the guaranteed fallback, so an AI outage never stalls an
     interview.
"""

import logging
import random
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Category, Focus, InterviewerStyle, QuestionSource
from app.models.interview_session import InterviewSession
from app.models.question import Question
from app.schemas.feedback import rubric_overall_score
from app.services import adaptive_engine, job_service, llm, repo
from app.services.adaptive_engine import (
    Decision,
    MasteryStat,
    SelectionMode,
    SessionTurn,
)
from app.services.competency import infer_competency
from app.services.interviewer_policy import policy_for

logger = logging.getLogger("rehearse.api")

# Generation costs one LLM call per question; past this many in one session the rest come from
# the bank (or follow-ups), keeping a long session's cost bounded.
MAX_GENERATED_PER_SESSION = 3
# A bank question may be used for a target level this far off (levels are 1-5).
_MAX_BANK_LEVEL_DISTANCE = 1


class NoQuestionAvailableError(Exception):
    """Raised only when the bank has nothing at all for this role and there is no LLM follow-up
    to fall back on (realistically: the very first question of a session whose role has no
    questions and whose generation also failed)."""


@dataclass(frozen=True)
class SelectedQuestion:
    text: str
    source: QuestionSource
    question_id: str | None
    category: Category
    competency: str | None
    level: int | None
    reason: str


def _bank_level(question: Question) -> int:
    if question.level is not None:
        return question.level
    return adaptive_engine.level_for_difficulty(question.difficulty)


def _bank_competency(question: Question) -> str | None:
    return question.competency or infer_competency(question.text, question.category)


async def load_history(db: AsyncSession, *, session: InterviewSession) -> list[SessionTurn]:
    """The session's questions so far (oldest first) joined to the score each one earned."""
    session_questions = await repo.list_session_questions_for_session(db, session_id=session.id)
    answers = await repo.list_answers_for_session(db, session_id=session.id)
    score_by_session_question = {
        answer.session_question_id: rubric_overall_score(answer.rubric)
        for answer in answers
        if answer.session_question_id
    }
    return [
        SessionTurn(
            competency=sq.competency,
            level=sq.level,
            category=sq.category,
            mode=sq.selection_reason,
            score=score_by_session_question.get(sq.id),
        )
        for sq in session_questions
    ]


async def _load_mastery(db: AsyncSession, *, session: InterviewSession) -> dict[str, MasteryStat]:
    rows = await repo.list_candidate_competencies(db, user_id=session.user_id, role=session.role)
    return {
        row.competency: MasteryStat(
            mastery=row.mastery_score,
            confidence=row.confidence_score,
            attempts=row.questions_attempted,
        )
        for row in rows
    }


async def select_next_question(
    db: AsyncSession,
    *,
    session: InterviewSession,
    prior_follow_up: str | None,
    previous_answer_summary: str | None = None,
    rng: random.Random | None = None,
) -> SelectedQuestion:
    rng = rng or random.Random()
    policy = policy_for(session.interviewer_style)
    plan = await job_service.plan_for_session(
        db,
        role=session.role,
        job_target_id=session.job_target_id,
        user_id=session.user_id,
        focus_topics=session.focus_topics,
    )
    history = await load_history(db, session=session)
    decision = adaptive_engine.decide_next(
        plan=plan,
        mastery=await _load_mastery(db, session=session),
        history=history,
        policy=policy,
        focus=session.focus,
        difficulty=session.difficulty,
    )

    used_ids = await repo.get_used_bank_question_ids_for_session(db, session_id=session.id)
    bank_role = job_service.bank_role_for(session.role)
    all_bank = await repo.list_questions(db, role=bank_role)
    bank = [q for q in all_bank if q.id not in used_ids]

    # 1. Probe the same competency using the follow-up the grader already wrote.
    if decision.mode in (SelectionMode.DEEPEN, SelectionMode.DIAGNOSTIC) and prior_follow_up:
        return SelectedQuestion(
            text=prior_follow_up,
            source=QuestionSource.FOLLOW_UP,
            question_id=None,
            category=decision.category,
            competency=decision.competency,
            level=decision.level,
            reason=decision.mode.value,
        )

    # 2. A bank question for this competency at about the right level.
    matched = _best_bank_match(bank, decision, rng, same_category_only=session.focus != Focus.MIXED)
    if matched is not None:
        return SelectedQuestion(
            text=matched.text,
            source=QuestionSource.BANK,
            question_id=matched.id,
            category=matched.category,
            competency=decision.competency,
            level=decision.level,
            reason=decision.mode.value,
        )

    # 3. Generate one, within budget, with the bank as the safety net.
    generated = await _try_generate(
        db,
        session=session,
        decision=decision,
        history=history,
        previous_answer_summary=previous_answer_summary,
        policy_style=session.interviewer_style,
    )
    if generated is not None:
        return generated

    # 4. Fallback: anything unused in the right category, then anywhere, then the follow-up.
    return _fallback(session, decision, bank, all_bank, prior_follow_up, rng)


def _best_bank_match(
    bank: list[Question], decision: Decision, rng: random.Random, *, same_category_only: bool
) -> Question | None:
    in_competency = [
        q
        for q in bank
        if (not same_category_only or q.category == decision.category)
        and _bank_competency(q) == decision.competency
        and abs(_bank_level(q) - decision.level) <= _MAX_BANK_LEVEL_DISTANCE
    ]
    if not in_competency:
        return None
    best_distance = min(abs(_bank_level(q) - decision.level) for q in in_competency)
    closest = [q for q in in_competency if abs(_bank_level(q) - decision.level) == best_distance]
    return rng.choice(closest)


async def _try_generate(
    db: AsyncSession,
    *,
    session: InterviewSession,
    decision: Decision,
    history: list[SessionTurn],
    previous_answer_summary: str | None,
    policy_style: InterviewerStyle | None,
) -> SelectedQuestion | None:
    questions = await repo.list_session_questions_for_session(db, session_id=session.id)
    generated_so_far = sum(1 for q in questions if q.source == QuestionSource.GENERATED)
    if generated_so_far >= MAX_GENERATED_PER_SESSION:
        return None

    already_asked = [q.text for q in questions]
    try:
        result = await llm.generate_question(
            policy=policy_for(policy_style),
            role_title=session.role_title or session.role,
            competency=decision.competency,
            category=decision.category,
            level=decision.level,
            mode=decision.mode.value,
            already_asked=already_asked,
            previous_answer_summary=previous_answer_summary,
            candidate_context=session.personalization_context(),
            language=session.language,
        )
    except Exception:
        # Broad on purpose: any provider/network/validation failure must degrade to a bank
        # question, never abort the interview. Logged without question or candidate content.
        logger.warning(
            "question_generation_failed competency=%s level=%s fallback=bank",
            decision.competency,
            decision.level,
        )
        return None

    normalized = _normalize(result.text)
    if any(_normalize(asked) == normalized for asked in already_asked):
        return None
    return SelectedQuestion(
        text=result.text.strip(),
        source=QuestionSource.GENERATED,
        question_id=None,
        category=decision.category,
        competency=decision.competency,
        level=decision.level,
        reason=decision.mode.value,
    )


def _normalize(text: str) -> str:
    return " ".join(text.lower().split())


def _fallback(
    session: InterviewSession,
    decision: Decision,
    bank: list[Question],
    all_bank: list[Question],
    prior_follow_up: str | None,
    rng: random.Random,
) -> SelectedQuestion:
    in_category = [q for q in bank if q.category == decision.category]
    pool = in_category or bank
    if pool:
        chosen = rng.choice(pool)
        return SelectedQuestion(
            text=chosen.text,
            source=QuestionSource.BANK,
            question_id=chosen.id,
            category=chosen.category,
            competency=_bank_competency(chosen),
            level=_bank_level(chosen),
            reason=SelectionMode.FALLBACK.value,
        )

    if prior_follow_up:
        return SelectedQuestion(
            text=prior_follow_up,
            source=QuestionSource.FOLLOW_UP,
            question_id=None,
            category=decision.category,
            competency=decision.competency,
            level=decision.level,
            reason=SelectionMode.FALLBACK.value,
        )

    # Every bank question for this role has been used in this session. A repeat beats ending
    # the interview, mirroring the previous behaviour.
    if all_bank:
        chosen = rng.choice(all_bank)
        return SelectedQuestion(
            text=chosen.text,
            source=QuestionSource.BANK,
            question_id=chosen.id,
            category=chosen.category,
            competency=_bank_competency(chosen),
            level=_bank_level(chosen),
            reason=SelectionMode.FALLBACK.value,
        )
    raise NoQuestionAvailableError(f"No questions available for {session.role}")
