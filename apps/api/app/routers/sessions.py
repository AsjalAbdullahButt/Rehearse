from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import get_settings
from app.core.errors import ApiError
from app.db import get_db
from app.models.enums import Category, SessionStatus
from app.models.interview_session import InterviewSession
from app.models.session_question import SessionQuestion
from app.models.user import User
from app.schemas.feedback import rubric_overall_score
from app.schemas.session import (
    AnswerCategoryBreakdown,
    PanelAssessment,
    SessionCreate,
    SessionOut,
    SessionQuestionOut,
    SessionSummary,
)
from app.services import job_service, panel, repo
from app.services.feedback import claim_out
from app.services.job_service import role_key_for_title
from app.services.question_orchestrator import NoQuestionAvailableError, select_next_question

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
    if body.panel and not get_settings().enable_panel_interview:
        raise ApiError(
            "feature_disabled",
            "Panel interviews are not available right now.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    role_key = role_key_for_title(body.role)
    preset = job_service.preset_role(role_key)
    role_title = None if preset else body.role
    target = await job_service.resolve_job_target(
        db,
        user_id=user.id,
        role_key=role_key,
        role_title=body.role,
        company=body.company,
        job_description=body.job_description,
        candidate_background=body.candidate_background,
    )

    session = await repo.create_session(
        db,
        user_id=user.id,
        role=role_key,
        role_title=role_title,
        job_target_id=target.id if target else None,
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
        panel=body.panel,
    )
    await job_service.seed_resume_claims(db, session=session, target=target)

    try:
        selected = await select_next_question(db, session=session, prior_follow_up=None)
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
        text=selected.text,
        category=selected.category,
        source=selected.source,
        question_id=selected.question_id,
        competency=selected.competency,
        level=selected.level,
        selection_reason=selected.reason,
        claim_id=selected.claim_id,
        panelist=selected.panelist,
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


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Lets a user remove one interview's transcripts/feedback without deleting their whole
    account — see AGENTS.md Phase 10's privacy-controls scope."""
    deleted = await repo.delete_session_and_all_data(db, session_id=session_id, user_id=user.id)
    if not deleted:
        raise ApiError(
            "session_not_found", "Session not found.", status_code=status.HTTP_404_NOT_FOUND
        )


@router.post("/sessions/{session_id}/end", response_model=SessionOut)
async def end_session_early(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionOut:
    """Persists a deliberate early exit as ENDED_EARLY so reports never present an unfinished
    interview as complete. Only an in-progress session can be ended (see
    SESSION_STATUS_TRANSITIONS); ending a finished one is a 409, not a silent no-op."""
    session = await repo.get_session_for_user(db, session_id=session_id, user_id=user.id)
    if session is None:
        raise ApiError(
            "session_not_found", "Session not found.", status_code=status.HTTP_404_NOT_FOUND
        )
    changed = await repo.transition_session_status(
        db, session_id=session.id, new_status=SessionStatus.ENDED_EARLY
    )
    if not changed:
        raise ApiError(
            "session_not_active",
            "This interview has already finished.",
            status_code=status.HTTP_409_CONFLICT,
        )
    await db.refresh(session)
    return _session_out(session)


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

    claim_rows = await repo.list_claims_for_session(db, session_id=session_id, user_id=user.id)
    panel_scores: dict[str, list[float]] = {}
    panel_questions: dict[str, int] = {}
    panelist_by_session_question_id = {sq.id: sq.panelist for sq in session_questions}
    for sq in session_questions:
        if sq.panelist:
            panel_questions[sq.panelist] = panel_questions.get(sq.panelist, 0) + 1
    for answer in answers:
        score = rubric_overall_score(answer.rubric)
        key = (
            panelist_by_session_question_id.get(answer.session_question_id)
            if answer.session_question_id
            else None
        )
        if score is not None and key:
            panel_scores.setdefault(key, []).append(score)
    panel_assessments = [
        PanelAssessment(
            panelist=member.key,
            name=member.name,
            title=member.title,
            label=panel.assessment_label(member.key),
            questions=panel_questions[member.key],
            avg_score=_avg(panel_scores.get(member.key, [])),
        )
        for member in panel.PANEL
        if member.key in panel_questions
    ]

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
        claims=[claim_out(row) for row in claim_rows],
        panel_assessments=panel_assessments,
    )
