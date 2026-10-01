import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class CandidateCompetency(Base):
    """A candidate's persistent mastery of one competency within one role — the long-lived
    counterpart to a session's one-off scores. `mastery_score` is a 0-1 recency-weighted
    estimate (see app/services/competency.py's update_mastery); `confidence_score` grows with
    the number of attempts so a single lucky answer isn't presented as established mastery."""

    __tablename__ = "candidate_competencies"
    __table_args__ = (
        Index("ux_candidate_competency", "user_id", "role", "competency", unique=True),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(64), nullable=False)
    competency: Mapped[str] = mapped_column(String(64), nullable=False)
    mastery_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    questions_attempted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    successful_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    highest_level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_practiced_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )
