from datetime import datetime

from pydantic import BaseModel

from app.models.enums import Difficulty


class SessionCreate(BaseModel):
    role: str
    difficulty: Difficulty


class SessionOut(BaseModel):
    id: str
    user_id: str
    role: str
    difficulty: Difficulty
    started_at: datetime
    ended_at: datetime | None

    model_config = {"from_attributes": True}
