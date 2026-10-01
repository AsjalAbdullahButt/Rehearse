from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db import get_db
from app.models.base import utcnow
from app.models.candidate_competency import CandidateCompetency
from app.models.user import User
from app.schemas.mastery import CompetencyMasteryOut, MasteryOut
from app.schemas.readiness import PracticePlanOut, ReadinessOut, ScheduledSkillOut
from app.services import job_service, readiness, repo, spaced_repetition
from app.services.competency import competency_name

router = APIRouter()

# A competency needs this many attempts before it can be called the strongest or weakest —
# one lucky or unlucky answer is not a verdict.
MIN_ATTEMPTS_FOR_RANKING = 2
NEEDS_PRACTICE_BELOW = 0.6


def _out(row: CandidateCompetency) -> CompetencyMasteryOut:
    return CompetencyMasteryOut(
        role=row.role,
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


@router.get("/practice-plan", response_model=PracticePlanOut)
async def get_practice_plan(
    role: Annotated[str | None, Query(max_length=64)] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PracticePlanOut:
    rows = await repo.list_candidate_competencies(db, user_id=user.id, role=role)
    plan = spaced_repetition.build_plan(
        [
            spaced_repetition.SkillState(
                competency=r.competency,
                mastery=r.mastery_score,
                attempts=r.questions_attempted,
                successful_attempts=r.successful_attempts,
                last_practiced_at=r.last_practiced_at,
            )
            for r in rows
        ],
        now=utcnow(),
    )

    def _out(skill: spaced_repetition.ScheduledSkill) -> ScheduledSkillOut:
        return ScheduledSkillOut(
            competency=skill.competency,
            name=skill.name,
            mastery=round(skill.mastery * 100),
            interval_days=skill.interval_days,
            due_at=skill.due_at,
            days_until_due=skill.days_until_due,
            is_due=skill.is_due,
        )

    return PracticePlanOut(
        role=role,
        today=[_out(s) for s in plan.today],
        upcoming=[_out(s) for s in plan.upcoming],
        question_count=plan.question_count,
        estimated_minutes=plan.estimated_minutes,
        focus_topics=[s.competency for s in plan.today],
    )


@router.get("/readiness", response_model=ReadinessOut)
async def get_readiness(
    role: Annotated[str, Query(min_length=1, max_length=64)],
    job_target_id: Annotated[str | None, Query(max_length=36)] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReadinessOut:
    """Readiness against the role's competency plan: an explicit `job_target_id` (must be the
    caller's own — otherwise it silently resolves to the default plan, leaking nothing), else the
    user's most recent job target for this role, else the role's default plan."""
    target_id = job_target_id or await repo.get_latest_job_target_id_for_role(
        db, user_id=user.id, role=role
    )
    plan = await job_service.plan_for_session(
        db, role=role, job_target_id=target_id, user_id=user.id
    )
    rows = await repo.list_candidate_competencies(db, user_id=user.id, role=role)
    return readiness.compute_readiness(
        plan,
        {
            r.competency: readiness.Evidence(
                mastery=r.mastery_score,
                confidence=r.confidence_score,
                attempts=r.questions_attempted,
            )
            for r in rows
        },
        role=role,
    )
