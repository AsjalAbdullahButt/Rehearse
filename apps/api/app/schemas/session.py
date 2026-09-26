from datetime import datetime

from pydantic import BaseModel

from app.models.enums import Difficulty, Role


class SessionCreate(BaseModel):
    role: Role
    difficulty: Difficulty


class SessionOut(BaseModel):
    id: str
    user_id: str
    role: Role
    difficulty: Difficulty
    started_at: datetime
    ended_at: datetime | None

    model_config = {"from_attributes": True}
