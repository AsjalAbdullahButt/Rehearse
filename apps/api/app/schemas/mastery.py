from datetime import datetime

from pydantic import BaseModel


class CompetencyMasteryOut(BaseModel):
    competency: str
    name: str
    # 0-100, derived from the recency-weighted mastery estimate.
    mastery: int
    # 0-100; low means "not enough evidence yet" and the UI should say so.
    confidence: int
    questions_attempted: int
    successful_attempts: int
    highest_level: int
    last_practiced_at: datetime | None


class MasteryOut(BaseModel):
    role: str | None
    competencies: list[CompetencyMasteryOut]
    # The same data, resolved into the four answers a candidate actually wants. Each is a
    # competency key, or None when there isn't enough evidence to say.
    strongest: str | None
    weakest: str | None
    needs_practice: list[str]
