import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow
from app.models.enums import Difficulty, Role


class InterviewSession(Base):
    """Maps to the `sessions` table; named InterviewSession in Python to avoid colliding
    with SQLAlchemy's own Session class."""

    __tablename__ = "sessions"
    __table_args__ = (Index("ix_sessions_user_id_started_at", "user_id", "started_at"),)

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
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime)
