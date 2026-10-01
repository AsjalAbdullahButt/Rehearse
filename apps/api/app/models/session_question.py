import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, SmallInteger, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow
from app.models.enums import Category, QuestionSource


class SessionQuestion(Base):
    """One row per question actually served in a session, in server-decided order — the
    browser never picks a question itself (see app/services/question_orchestrator.py). Kept
    separate from `Question` (the static bank) because a generated or follow-up question has no
    bank row at all; `question_id` is only ever set for source=BANK."""

    __tablename__ = "session_questions"
    __table_args__ = (
        Index(
            "ux_session_questions_session_id_sequence",
            "session_id",
            "sequence_number",
            unique=True,
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[Category] = mapped_column(
        SAEnum(Category, native_enum=False, length=16, validate_strings=True), nullable=False
    )
    source: Mapped[QuestionSource] = mapped_column(
        SAEnum(QuestionSource, native_enum=False, length=16, validate_strings=True), nullable=False
    )
    # What the adaptive engine was testing with this question, and why it chose it — nullable
    # for rows from before the engine existed. `selection_reason` is the audit trail for "why did
    # I get this question?" (coverage / deepen / diagnostic / fallback).
    competency: Mapped[str | None] = mapped_column(String(64))
    level: Mapped[int | None] = mapped_column(SmallInteger)
    selection_reason: Mapped[str | None] = mapped_column(String(24))
    question_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("questions.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
