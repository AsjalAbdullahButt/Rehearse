import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow
from app.models.enums import (
    Difficulty,
    ExperienceLevel,
    Focus,
    InterviewerStyle,
    Role,
    SessionStatus,
)
from app.models.profile import ANSWER_CAP_CHOICES

QUESTION_COUNT_CHOICES = (3, 5, 8)

# Server-side length caps mirrored in app/schemas/session.py's SessionCreate — enforced at both
# layers so a row can never end up over-limit regardless of which validation a future caller
# skips (Pydantic is the one actually reached by the API; these exist for defense in depth and
# so the columns are sized correctly).
MAX_COMPANY_LENGTH = 120
MAX_INDUSTRY_LENGTH = 120
MAX_JOB_DESCRIPTION_LENGTH = 12_000
MAX_CANDIDATE_BACKGROUND_LENGTH = 8_000
MAX_FOCUS_TOPICS = 10
MAX_FOCUS_TOPIC_LENGTH = 80


class InterviewSession(Base):
    """Maps to the `sessions` table; named InterviewSession in Python to avoid colliding
    with SQLAlchemy's own Session class."""

    __tablename__ = "sessions"
    __table_args__ = (
        Index("ix_sessions_user_id_started_at", "user_id", "started_at"),
        CheckConstraint(
            f"question_count IN ({', '.join(str(c) for c in QUESTION_COUNT_CHOICES)})",
            name="ck_sessions_question_count",
        ),
        CheckConstraint(
            f"answer_cap_s IN ({', '.join(str(c) for c in ANSWER_CAP_CHOICES)})",
            name="ck_sessions_answer_cap_s",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Same length as the existing column (was a plain String(64)) so this is a Python-side
    # typing change only — no DDL diff, no migration needed. native_enum=False matches
    # Question.role: a portable VARCHAR + Python-side validation, not a MySQL-native ENUM.
    role: Mapped[Role] = mapped_column(
        SAEnum(Role, native_enum=False, length=64, validate_strings=True), nullable=False
    )
    difficulty: Mapped[Difficulty] = mapped_column(
        SAEnum(Difficulty, native_enum=False, length=16, validate_strings=True), nullable=False
    )
    experience_level: Mapped[ExperienceLevel | None] = mapped_column(
        SAEnum(ExperienceLevel, native_enum=False, length=16, validate_strings=True)
    )
    focus: Mapped[Focus] = mapped_column(
        SAEnum(Focus, native_enum=False, length=16, validate_strings=True),
        nullable=False,
        default=Focus.MIXED,
    )
    question_count: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    # Applies to every question in the session (set once at setup) — the API no longer trusts a
    # per-answer time_cap_s form field the client could vary from one submission to the next.
    answer_cap_s: Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    company: Mapped[str | None] = mapped_column(String(MAX_COMPANY_LENGTH))
    industry: Mapped[str | None] = mapped_column(String(MAX_INDUSTRY_LENGTH))
    job_description: Mapped[str | None] = mapped_column(Text)
    candidate_background: Mapped[str | None] = mapped_column(Text)
    skills: Mapped[list[str] | None] = mapped_column(JSON)
    focus_topics: Mapped[list[str] | None] = mapped_column(JSON)
    years_experience: Mapped[int | None] = mapped_column(Integer)
    interviewer_style: Mapped[InterviewerStyle | None] = mapped_column(
        SAEnum(InterviewerStyle, native_enum=False, length=16, validate_strings=True)
    )
    language: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[SessionStatus] = mapped_column(
        SAEnum(SessionStatus, native_enum=False, length=16, validate_strings=True),
        nullable=False,
        default=SessionStatus.IN_PROGRESS,
    )
    # 0 until the first question is generated, then tracks how many questions have been served
    # (not how many have been answered) — see app/services/question_orchestrator.py.
    current_question_number: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime)

    def personalization_context(self) -> dict[str, Any]:
        """What the LLM's adaptive follow-up question is allowed to see about this session's
        setup — used by app/prompts/feedback.py, kept in one place so the prompt and any future
        caller agree on the exact same shape."""
        return {
            "company": self.company,
            "industry": self.industry,
            "job_description": self.job_description,
            "candidate_background": self.candidate_background,
            "skills": self.skills,
            "focus_topics": self.focus_topics,
            "years_experience": self.years_experience,
            "interviewer_style": self.interviewer_style,
        }
