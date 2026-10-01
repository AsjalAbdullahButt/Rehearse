from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.core.config import get_settings
from app.models.user import User

router = APIRouter()


class FeaturesOut(BaseModel):
    panel_interview: bool


@router.get("/features", response_model=FeaturesOut)
async def get_features(user: User = Depends(get_current_user)) -> FeaturesOut:
    """Which flag-gated features are switched on, so the UI only offers what the API will accept."""
    return FeaturesOut(panel_interview=get_settings().enable_panel_interview)
