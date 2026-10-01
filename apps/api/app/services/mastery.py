"""Persists what an answer taught us about the candidate's competency — the bridge between a
single graded answer and the long-lived `CandidateCompetency` model. All score maths lives in
app/services/competency.py (pure, unit-tested); this only loads/creates the row and saves it."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import utcnow
from app.models.candidate_competency import CandidateCompetency
from app.services import repo
from app.services.competency import MAX_LEVEL, MIN_LEVEL, evidence_score, update_mastery

# A 0-10 rubric average at/above this counts as a "successful" attempt.
SUCCESS_SCORE = 6.5


async def record_answer_evidence(
    db: AsyncSession,
    *,
    user_id: str,
    role: str,
    competency: str,
    score_0_to_10: float,
    level: int | None,
) -> CandidateCompetency:
    effective_level = max(MIN_LEVEL, min(MAX_LEVEL, level or 3))
    row = await repo.get_candidate_competency(db, user_id=user_id, role=role, competency=competency)
    if row is None:
        row = CandidateCompetency(
            user_id=user_id,
            role=role,
            competency=competency,
            mastery_score=0.0,
            confidence_score=0.0,
            questions_attempted=0,
            successful_attempts=0,
            highest_level=MIN_LEVEL,
        )

    mastery, confidence = update_mastery(
        row.mastery_score,
        row.questions_attempted,
        evidence_score(score_0_to_10, effective_level),
    )
    row.mastery_score = mastery
    row.confidence_score = confidence
    row.questions_attempted += 1
    if score_0_to_10 >= SUCCESS_SCORE:
        row.successful_attempts += 1
        row.highest_level = max(row.highest_level, effective_level)
    row.last_practiced_at = utcnow()
    return await repo.save_candidate_competency(db, row=row)
