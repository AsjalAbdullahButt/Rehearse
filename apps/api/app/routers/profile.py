from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.errors import ApiError
from app.db import get_db
from app.models.user import User
from app.schemas.profile import ProfileOut, ProfileUpdate
from app.services import repo

router = APIRouter()


@router.get("/profile", response_model=ProfileOut)
async def get_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileOut:
    profile = await repo.get_profile(db, user_id=user.id)
    if profile is None:
        raise ApiError(
            "profile_not_found", "Profile not found.", status_code=status.HTTP_404_NOT_FOUND
        )
    return ProfileOut.model_validate(profile)


@router.patch("/profile", response_model=ProfileOut)
async def update_profile(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileOut:
    updates = body.model_dump(exclude_unset=True)
    profile = await repo.update_profile(db, user_id=user.id, updates=updates)
    return ProfileOut.model_validate(profile)
