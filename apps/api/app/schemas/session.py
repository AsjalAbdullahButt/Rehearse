from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.enums import (
    Category,
    Difficulty,
    ExperienceLevel,
    Focus,
    InterviewerStyle,
    QuestionSource,
    Role,
    SessionStatus,
)
from app.models.interview_session import (
    MAX_CANDIDATE_BACKGROUND_LENGTH,
    MAX_COMPANY_LENGTH,
    MAX_FOCUS_TOPIC_LENGTH,
    MAX_FOCUS_TOPICS,
    MAX_INDUSTRY_LENGTH,
    MAX_JOB_DESCRIPTION_LENGTH,
    QUESTION_COUNT_CHOICES,
)
from app.models.profile import ANSWER_CAP_CHOICES


class SessionCreate(BaseModel):
    role: Role
    difficulty: Difficulty
    experience_level: ExperienceLevel
    focus: Focus
    question_count: int
    answer_cap_s: int
    company: str | None = Field(default=None, max_length=MAX_COMPANY_LENGTH)
    industry: str | None = Field(default=None, max_length=MAX_INDUSTRY_LENGTH)
    job_description: str | None = Field(default=None, max_length=MAX_JOB_DESCRIPTION_LENGTH)
    candidate_background: str | None = Field(
        default=None, max_length=MAX_CANDIDATE_BACKGROUND_LENGTH
    )
    skills: list[str] | None = None
    focus_topics: list[str] | None = None
    years_experience: int | None = Field(default=None, ge=0, le=80)
    interviewer_style: InterviewerStyle | None = None
    language: str | None = Field(default=None, max_length=32)

    @field_validator("question_count")
    @classmethod
    def _valid_question_count(cls, value: int) -> int:
        if value not in QUESTION_COUNT_CHOICES:
            raise ValueError(f"question_count must be one of {QUESTION_COUNT_CHOICES}")
        return value

    @field_validator("answer_cap_s")
    @classmethod
    def _valid_answer_cap(cls, value: int) -> int:
        if value not in ANSWER_CAP_CHOICES:
            raise ValueError(f"answer_cap_s must be one of {ANSWER_CAP_CHOICES}")
        return value

    @field_validator("skills")
    @classmethod
    def _clean_skills(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        cleaned = [skill.strip() for skill in value if skill.strip()]
        return cleaned or None

    @field_validator("focus_topics")
    @classmethod
    def _clean_focus_topics(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        cleaned = [topic.strip() for topic in value if topic.strip()]
        if len(cleaned) > MAX_FOCUS_TOPICS:
            raise ValueError(f"focus_topics can have at most {MAX_FOCUS_TOPICS} entries")
        for topic in cleaned:
            if len(topic) > MAX_FOCUS_TOPIC_LENGTH:
                raise ValueError(
                    f"each focus topic must be at most {MAX_FOCUS_TOPIC_LENGTH} characters"
                )
        return cleaned or None


class SessionQuestionOut(BaseModel):
    id: str
    sequence_number: int
    text: str
    category: Category
    source: QuestionSource

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    id: str
    user_id: str
    role: Role
    difficulty: Difficulty
    experience_level: ExperienceLevel | None
    focus: Focus
    question_count: int
    answer_cap_s: int
    company: str | None
    industry: str | None
    interviewer_style: InterviewerStyle | None
    language: str | None
    status: SessionStatus
    current_question_number: int
    started_at: datetime
    ended_at: datetime | None
    # Not a DB column — attached by the router when a question has just been generated/selected
    # for this session (session creation, and every answer that isn't the session's last).
    current_question: SessionQuestionOut | None = None

    model_config = {"from_attributes": True}


class AnswerCategoryBreakdown(BaseModel):
    category: Category
    avg_score: float | None


class SessionSummary(BaseModel):
    """The end-of-session report (Phase 8's "final session report") — aggregates the answers
    that already exist rather than re-scoring anything, per app/services/llm.py's one-call-per-
    answer design."""

    session: SessionOut
    questions_completed: int
    overall_score: float | None
    category_breakdown: list[AnswerCategoryBreakdown]
    avg_wpm: float | None
    avg_filler_count: float | None
    avg_clarity: float | None
