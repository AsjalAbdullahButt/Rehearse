from datetime import datetime

from pydantic import BaseModel

from app.models.enums import Category


class ReadinessDriver(BaseModel):
    competency: str
    name: str
    weight: float
    mastery: int | None
    confidence: int | None
    attempts: int
    assessed: bool
    resume_evidence: str


class CategoryReadiness(BaseModel):
    category: Category
    score: int


class ReadinessOut(BaseModel):
    """The Rehearse Readiness Score. `score` is None when there isn't enough evidence — never a
    guess. Not a percentile and not compared against other candidates."""

    role: str
    score: int | None
    # Share (0-100) of the role's plan weight that has been assessed.
    coverage: int
    total_attempts: int
    categories: list[CategoryReadiness]
    strongest: str | None
    main_risk: str | None
    drivers: list[ReadinessDriver]
    explanation: list[str]


class ScheduledSkillOut(BaseModel):
    competency: str
    name: str
    mastery: int
    interval_days: int
    due_at: datetime
    days_until_due: int
    is_due: bool


class PracticePlanOut(BaseModel):
    role: str | None
    today: list[ScheduledSkillOut]
    upcoming: list[ScheduledSkillOut]
    question_count: int
    estimated_minutes: int
    # Pass these straight to a new session's `focus_topics` to practise today's skills.
    focus_topics: list[str]
