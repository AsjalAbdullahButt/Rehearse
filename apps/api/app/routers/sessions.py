from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.errors import ApiError
from app.db import get_db
from app.models.enums import Category
from app.models.interview_session import InterviewSession
from app.models.session_question import SessionQuestion
from app.models.user import User
from app.schemas.feedback import rubric_overall_score
from app.schemas.session import (
    AnswerCategoryBreakdown,
    SessionCreate,
    SessionOut,
    SessionQuestionOut,
    SessionSummary,
)
from app.services import repo
from app.services.question_orchestrator import (
    NoQuestionAvailableError,
    category_for_position,
    select_next_question,
)

router = APIRouter()


def _session_out(
    session: InterviewSession, current_question: SessionQuestion | None = None
) -> SessionOut:
    out = SessionOut.model_validate(session)
    if current_question is not None:
        out.current_question = SessionQuestionOut.model_validate(current_question)
    return out


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionOut:
    session = await repo.create_session(
        db,
        user_id=user.id,
        role=body.role,
        difficulty=body.difficulty,
        experience_level=body.experience_level,
        focus=body.focus,
        question_count=body.question_count,
        answer_cap_s=body.answer_cap_s,
        company=body.company,
        industry=body.industry,
        job_description=body.job_description,
        candidate_background=body.candidate_background,
        skills=body.skills,
        focus_topics=body.focus_topics,
        years_experience=body.years_experience,
        interviewer_style=body.interviewer_style,
        language=body.language,
    )

    category = category_for_position(session.focus, 1)
    try:
        text, source, question_id = await select_next_question(
            db, session=session, category=category, prior_follow_up=None
        )
    except NoQuestionAvailableError as exc:
        raise ApiError(
            "no_questions_available",
            "No questions are available for that role yet.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        ) from exc

    first_question = await repo.create_session_question(
        db,
        session_id=session.id,
        sequence_number=1,
        text=text,
        category=category,
        source=source,
        question_id=question_id,
    )

    return _session_out(session, first_question)


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SessionOut]:
    sessions = await repo.list_sessions_for_user(db, user_id=user.id, limit=limit, offset=offset)
    return [SessionOut.model_validate(session) for session in sessions]


@router.get("/sessions/{session_id}", response_model=SessionSummary)
async def get_session_summary(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionSummary:
    session = await repo.get_session_for_user(db, session_id=session_id, user_id=user.id)
    if session is None:
        raise ApiError(
            "session_not_found", "Session not found.", status_code=status.HTTP_404_NOT_FOUND
        )

    answers = await repo.list_answers_for_session(db, session_id=session_id)
    session_questions = await repo.list_session_questions_for_session(db, session_id=session_id)
    category_by_session_question_id = {sq.id: sq.category for sq in session_questions}

    scores_by_category: dict[Category, list[float]] = {}
    overall_scores: list[float] = []
    for answer in answers:
        score = rubric_overall_score(answer.rubric)
        if score is None:
            continue
        overall_scores.append(score)
        category = (
            category_by_session_question_id.get(answer.session_question_id)
            if answer.session_question_id
            else None
        )
        if category is not None:
            scores_by_category.setdefault(category, []).append(score)

    def _avg(values: list[float]) -> float | None:
        return round(sum(values) / len(values), 2) if values else None

    return SessionSummary(
        session=_session_out(session),
        questions_completed=len(answers),
        overall_score=_avg(overall_scores),
        category_breakdown=[
            AnswerCategoryBreakdown(category=category, avg_score=_avg(values))
            for category, values in scores_by_category.items()
        ],
        avg_wpm=_avg([float(a.wpm) for a in answers]),
        avg_filler_count=_avg([float(a.filler_count) for a in answers]),
        avg_clarity=_avg([float(a.clarity) for a in answers if a.clarity is not None]),
    )
