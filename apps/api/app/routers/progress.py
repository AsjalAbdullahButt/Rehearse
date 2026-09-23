from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db import get_db
from app.models.user import User
from app.schemas.progress import ProgressOut
from app.services import repo

router = APIRouter()


@router.get("/progress", response_model=ProgressOut)
async def get_progress(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProgressOut:
    rows = await repo.get_progress_for_user(db, user_id=user.id)
    return ProgressOut(sessions=rows)
