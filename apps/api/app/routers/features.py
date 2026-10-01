from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.core.config import get_settings
from app.models.user import User

router = APIRouter()


class FeaturesOut(BaseModel):
    panel_interview: bool
    camera_coach: bool


@router.get("/features", response_model=FeaturesOut)
async def get_features(user: User = Depends(get_current_user)) -> FeaturesOut:
    """Which flag-gated features are switched on, so the UI only offers what the API will accept."""
    settings = get_settings()
    return FeaturesOut(
        panel_interview=settings.enable_panel_interview,
        camera_coach=settings.enable_camera_coach,
    )
