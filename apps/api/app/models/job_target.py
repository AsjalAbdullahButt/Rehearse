import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class JobTarget(Base):
    """A role (and optionally a job description) the candidate is preparing for, with its
    analysed competency map. Persisted so the same target — including the one LLM call that
    analysed it — is reused across sessions instead of re-analysed every time. `analysis_hash`
    covers every input the analysis depends on (title, JD, resume background), so a changed
    input correctly invalidates the cache."""

    __tablename__ = "job_targets"
    __table_args__ = (Index("ux_job_targets_user_hash", "user_id", "analysis_hash", unique=True),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role_title: Mapped[str] = mapped_column(String(80), nullable=False)
    company_name: Mapped[str | None] = mapped_column(String(120))
    job_description: Mapped[str | None] = mapped_column(Text)
    seniority: Mapped[str | None] = mapped_column(String(24))
    analysis_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    # "llm" when the model produced the map, "default" when it failed (or nothing needed
    # analysing) and the role's static default plan was used instead.
    analysis_source: Mapped[str] = mapped_column(String(16), nullable=False, default="default")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)


class JobCompetency(Base):
    __tablename__ = "job_competencies"
    __table_args__ = (Index("ux_job_competency", "job_target_id", "competency", unique=True),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_target_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("job_targets.id", ondelete="CASCADE"), nullable=False
    )
    competency: Mapped[str] = mapped_column(String(64), nullable=False)
    # 0-1, normalised so a target's weights sum to 1.
    weight: Mapped[float] = mapped_column(Float, nullable=False)
    # "required" | "preferred"
    importance: Mapped[str] = mapped_column(String(12), nullable=False, default="required")
    # How well the candidate's resume evidences it: strong/medium/basic/missing/unknown.
    resume_evidence: Mapped[str] = mapped_column(String(12), nullable=False, default="unknown")
    # "jd" | "role_default"
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="role_default")
