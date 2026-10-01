from datetime import datetime

from pydantic import BaseModel


class AttemptOut(BaseModel):
    answer_id: str
    attempt_number: int
    transcript: str
    created_at: datetime
    overall_score: float | None
    clarity: int | None
    wpm: float
    filler_rate_per_100_words: float
    rubric: dict[str, float]


class ComponentDelta(BaseModel):
    key: str
    before: float
    after: float
    delta: float


class AttemptComparison(BaseModel):
    attempts: list[AttemptOut]
    # Latest attempt minus the first; None until there are two attempts.
    overall_delta: float | None
    components: list[ComponentDelta]
    improved: list[str]
    regressed: list[str]
    remained_weak: list[str]
    focus_next: str | None
    filler_rate_delta: float | None
    wpm_delta: float | None
    summary: list[str]
