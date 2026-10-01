from datetime import datetime

from pydantic import BaseModel

from app.models.enums import Category, SessionStatus
from app.schemas.claims import ClaimOut
from app.schemas.feedback import FeedbackReport
from app.schemas.session import SessionQuestionOut
from app.schemas.transcription import TranscriptPart


class AnswerReport(BaseModel):
    id: str
    session_id: str
    question_id: str | None
    session_question_id: str | None
    category: Category
    question_text: str
    transcript: str
    transcript_parts: list[TranscriptPart]
    duration_s: float
    wpm: float
    word_count: int
    filler_count: int
    filler_breakdown: dict[str, int]
    possible_filler_count: int
    possible_filler_breakdown: dict[str, int]
    filler_rate_per_100_words: float
    long_pauses: int
    max_pause_s: float | None
    total_long_pause_s: float
    avg_pause_s: float | None
    rambling: str | None
    confidence_note: str | None
    transcription_quality_warning: str | None
    feedback: FeedbackReport
    created_at: datetime
    # Session-progression fields — what InterviewFlow needs to show "Question X of Y" and either
    # continue to the next question or route to the final session summary.
    question_number: int
    question_count: int
    session_status: SessionStatus
    next_question: SessionQuestionOut | None
    # 1 for an original answer; >1 for a retry of `original_answer_id`.
    attempt_number: int = 1
    original_answer_id: str | None = None
    # Probe-worthy claims extracted from this answer (empty for older answers and retries).
    claims: list[ClaimOut] = []

    model_config = {"from_attributes": True}


class AnswerSummary(BaseModel):
    """A lighter row shape for GET /sessions and GET /progress — the full transcript and
    per-word timing aren't needed there."""

    id: str
    session_id: str
    question_text: str
    wpm: float
    filler_count: int
    clarity: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
