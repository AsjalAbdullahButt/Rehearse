import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class ReportShare(Base):
    """Candidate-controlled, read-only report share.

    The public URL token is never stored directly. `token_hash` is enough to resolve an incoming
    token, while keeping existing links out of reach if the database is exposed.
    """

    __tablename__ = "report_shares"
    __table_args__ = (
        Index("ix_report_shares_user_id_created_at", "user_id", "created_at"),
        Index("ix_report_shares_answer_id", "answer_id"),
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    answer_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("answers.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    audience: Mapped[str] = mapped_column(String(16), nullable=False, default="mentor")
    note: Mapped[str | None] = mapped_column(Text)
    # Whether the viewer of this link may read the full transcript. Chosen by the candidate when
    # creating the link and enforced when the link is opened; off unless asked for.
    include_transcript: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_accessed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
