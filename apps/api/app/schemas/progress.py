from datetime import datetime

from pydantic import BaseModel

from app.models.enums import Difficulty


class ProgressRow(BaseModel):
    session_id: str
    role: str
    difficulty: Difficulty
    started_at: datetime
    answer_count: int
    avg_wpm: float | None
    avg_filler_count: float | None
    avg_clarity: float | None
    avg_star: float | None


class ProgressOut(BaseModel):
    sessions: list[ProgressRow]
