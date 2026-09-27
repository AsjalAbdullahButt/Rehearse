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
    # Renamed from avg_star: averages whichever rubric applied per answer (behavioral/
    # technical/situational — see app/schemas/feedback.py's rubric_overall_score), not just
    # STAR, now that scoring is category-specific.
    avg_overall_score: float | None


class ProgressOut(BaseModel):
    sessions: list[ProgressRow]
