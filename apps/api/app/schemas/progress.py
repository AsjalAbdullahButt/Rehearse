from datetime import datetime

from pydantic import BaseModel

from app.models.enums import Difficulty, InterviewMode


class ProgressRow(BaseModel):
    session_id: str
    role: str
    difficulty: Difficulty
    interview_mode: InterviewMode
    started_at: datetime
    answer_count: int
    avg_wpm: float | None
    avg_filler_count: float | None
    avg_clarity: float | None
    # Renamed from avg_star: averages whichever rubric applied per answer (behavioral/
    # technical/situational — see app/schemas/feedback.py's rubric_overall_score), not just
    # STAR, now that scoring is category-specific.
    avg_overall_score: float | None
    # Rate, not raw count — comparable across answers of different lengths (see
    # app/services/metrics.py's filler_rate_per_100_words). Used for the progress page's filler
    # trend chart, which a duration-dependent raw count would skew.
    avg_filler_rate_per_100_words: float | None
    # Only the categories this session actually asked (a "technical"-focus session has just
    # one key; "mixed" can have up to three) — the progress page's category trend chart reads
    # this per session rather than needing a second endpoint.
    category_scores: dict[str, float]


class ProgressOut(BaseModel):
    sessions: list[ProgressRow]
