from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db import get_db
from app.models.candidate_competency import CandidateCompetency
from app.models.user import User
from app.schemas.mastery import CompetencyMasteryOut, MasteryOut
from app.services import repo
from app.services.competency import competency_name

router = APIRouter()

# A competency needs this many attempts before it can be called the strongest or weakest —
# one lucky or unlucky answer is not a verdict.
MIN_ATTEMPTS_FOR_RANKING = 2
NEEDS_PRACTICE_BELOW = 0.6


def _out(row: CandidateCompetency) -> CompetencyMasteryOut:
    return CompetencyMasteryOut(
        competency=row.competency,
        name=competency_name(row.competency),
        mastery=round(row.mastery_score * 100),
        confidence=round(row.confidence_score * 100),
        questions_attempted=row.questions_attempted,
        successful_attempts=row.successful_attempts,
        highest_level=row.highest_level,
        last_practiced_at=row.last_practiced_at,
    )


@router.get("/mastery", response_model=MasteryOut)
async def get_mastery(
    role: Annotated[str | None, Query(max_length=64)] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MasteryOut:
    rows = await repo.list_candidate_competencies(db, user_id=user.id, role=role)
    ranked = sorted(
        (r for r in rows if r.questions_attempted >= MIN_ATTEMPTS_FOR_RANKING),
        key=lambda r: (r.mastery_score, r.competency),
    )
    return MasteryOut(
        role=role,
        competencies=[_out(r) for r in sorted(rows, key=lambda r: -r.mastery_score)],
        strongest=ranked[-1].competency if ranked else None,
        weakest=ranked[0].competency if ranked else None,
        needs_practice=[r.competency for r in ranked if r.mastery_score < NEEDS_PRACTICE_BELOW],
    )
