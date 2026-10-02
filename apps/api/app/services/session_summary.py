from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Category
from app.models.interview_session import InterviewSession
from app.schemas.feedback import rubric_overall_score
from app.schemas.session import AnswerCategoryBreakdown, PanelAssessment, SessionOut, SessionSummary
from app.services import panel, repo
from app.services.feedback import claim_out


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


async def build_session_summary(db: AsyncSession, *, session: InterviewSession) -> SessionSummary:
    answers = await repo.list_answers_for_session(db, session_id=session.id)
    session_questions = await repo.list_session_questions_for_session(db, session_id=session.id)
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

    claim_rows = await repo.list_claims_for_session(
        db, session_id=session.id, user_id=session.user_id
    )
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

    return SessionSummary(
        session=SessionOut.model_validate(session),
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
        panel_assessments=[
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
        ],
    )
