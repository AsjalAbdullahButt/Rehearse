from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db import get_db
from app.models.enums import Difficulty, Role
from app.models.user import User
from app.schemas.question import QuestionOut
from app.services import repo

router = APIRouter()


@router.get("/questions", response_model=list[QuestionOut])
async def list_questions(
    role: Role,
    difficulty: Difficulty | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[QuestionOut]:
    questions = await repo.list_questions(db, role=role, difficulty=difficulty)
    answered_ids = await repo.get_answered_question_ids(
        db, user_id=user.id, role=role, difficulty=difficulty
    )

    # Bias a repeat practice round away from questions this user has already answered in this
    # exact role/difficulty, so "do easy backend again" doesn't just replay the same 12
    # questions. Once every question in the pool has been answered, fall back to the full pool
    # (repeats) rather than returning an empty list and dead-ending the interview flow.
    unanswered = [question for question in questions if question.id not in answered_ids]
    pool = unanswered if unanswered else questions

    return [QuestionOut.model_validate(question) for question in pool]
