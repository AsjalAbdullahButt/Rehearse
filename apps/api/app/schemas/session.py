from datetime import datetime

from pydantic import BaseModel, Field, computed_field, field_validator

from app.core.languages import SUPPORTED_LANGUAGES
from app.models.enums import (
    Category,
    Difficulty,
    ExperienceLevel,
    Focus,
    InterviewerStyle,
    QuestionSource,
    SessionStatus,
)
from app.models.interview_session import (
    MAX_CANDIDATE_BACKGROUND_LENGTH,
    MAX_COMPANY_LENGTH,
    MAX_FOCUS_TOPIC_LENGTH,
    MAX_FOCUS_TOPICS,
    MAX_INDUSTRY_LENGTH,
    MAX_JOB_DESCRIPTION_LENGTH,
    MAX_ROLE_TITLE_LENGTH,
    MAX_SKILL_LENGTH,
    MAX_SKILLS,
    QUESTION_COUNT_CHOICES,
)
from app.models.profile import ANSWER_CAP_CHOICES
from app.schemas.answer import ClaimOut
from app.services import panel
from app.services.job_service import clean_role_title


class SessionCreate(BaseModel):
    # A preset role slug ("backend") or any free-text professional role ("AI Automation
    # Engineer"). Custom roles are interviewed via generated questions and an analysed
    # competency plan — see app/services/job_service.py.
    role: str = Field(min_length=2, max_length=MAX_ROLE_TITLE_LENGTH)
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
    # A panel interview (recruiter / technical lead / manager); behind ENABLE_PANEL_INTERVIEW.
    panel: bool = False

    @field_validator("role")
    @classmethod
    def _clean_role(cls, value: str) -> str:
        return clean_role_title(value)

    @field_validator("language")
    @classmethod
    def _supported_language(cls, value: str | None) -> str | None:
        if value is None:
            return None
        code = value.strip().lower()
        if code not in SUPPORTED_LANGUAGES:
            raise ValueError(f"language must be one of {sorted(SUPPORTED_LANGUAGES)}")
        return code

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
        if len(cleaned) > MAX_SKILLS:
            raise ValueError(f"skills can have at most {MAX_SKILLS} entries")
        for skill in cleaned:
            if len(skill) > MAX_SKILL_LENGTH:
                raise ValueError(f"each skill must be at most {MAX_SKILL_LENGTH} characters")
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
    competency: str | None = None
    level: int | None = None
    selection_reason: str | None = None
    # Panel interviews only: who is asking. These are simulated interviewers.
    panelist: str | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def panelist_name(self) -> str | None:
        member = panel.panelist_by_key(self.panelist)
        return member.name if member else None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def panelist_title(self) -> str | None:
        member = panel.panelist_by_key(self.panelist)
        return member.title if member else None

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    id: str
    user_id: str
    role: str
    role_title: str | None
    difficulty: Difficulty
    experience_level: ExperienceLevel | None
    focus: Focus
    question_count: int
    answer_cap_s: int
    company: str | None
    industry: str | None
    interviewer_style: InterviewerStyle | None
    language: str | None
    job_target_id: str | None
    panel: bool
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


class PanelAssessment(BaseModel):
    """One panelist's share of the interview: the questions they asked and the average score of
    the answers to them (0-10). A panelist who asked nothing is omitted."""

    panelist: str
    name: str
    title: str
    label: str
    questions: int
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
    # Claims that came up (from answers or the resume) and how well each has been supported.
    claims: list[ClaimOut] = []
    panel_assessments: list[PanelAssessment] = []
