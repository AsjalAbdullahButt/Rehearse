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
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[QuestionOut]:
    questions = await repo.list_questions(db, role=role, difficulty=difficulty)
    return [QuestionOut.model_validate(question) for question in questions]
