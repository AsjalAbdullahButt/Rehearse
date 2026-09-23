from datetime import datetime

from pydantic import BaseModel

from app.schemas.feedback import LLMFeedback
from app.schemas.transcription import TranscriptPart


class AnswerReport(BaseModel):
    id: str
    session_id: str
    question_id: str | None
    question_text: str
    transcript: str
    transcript_parts: list[TranscriptPart]
    duration_s: float
    wpm: float
    filler_count: int
    filler_breakdown: dict[str, int]
    long_pauses: int
    rambling: str | None
    feedback: LLMFeedback
    created_at: datetime

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
