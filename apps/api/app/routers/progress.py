from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db import get_db
from app.models.user import User
from app.schemas.progress import ProgressOut
from app.services import repo

router = APIRouter()


@router.get("/progress", response_model=ProgressOut)
async def get_progress(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProgressOut:
    rows = await repo.get_progress_for_user(db, user_id=user.id, limit=limit, offset=offset)
    return ProgressOut(sessions=rows)
