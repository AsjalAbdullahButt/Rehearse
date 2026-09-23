import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    DECIMAL,
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class Answer(Base):
    __tablename__ = "answers"
    __table_args__ = (
        CheckConstraint("clarity BETWEEN 0 AND 10", name="ck_answers_clarity"),
        Index("ix_answers_user_id_created_at", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("questions.id", ondelete="SET NULL")
    )
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    transcript: Mapped[str] = mapped_column(Text, nullable=False)
    words: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    duration_s: Mapped[float] = mapped_column(DECIMAL(6, 2), nullable=False)
    wpm: Mapped[float] = mapped_column(DECIMAL(6, 2), nullable=False)
    filler_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    filler_breakdown: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    long_pauses: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rambling: Mapped[str | None] = mapped_column(Text)
    star: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    clarity: Mapped[int | None] = mapped_column(SmallInteger)
    on_topic: Mapped[bool | None] = mapped_column(Boolean)
    feedback: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    sample_answer: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
