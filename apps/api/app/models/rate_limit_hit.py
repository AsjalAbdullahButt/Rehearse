import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class RateLimitHit(Base):
    """One row per request counted against a durable, cross-instance rate limit (see
    app/core/rate_limit.py) — counted directly from real rows the same way
    repo.count_answers_today backs the daily answer cap, rather than a separate mutable counter
    that could drift. Deliberately not process-local: slowapi's in-memory limiter doesn't hold
    across Vercel's serverless cold starts, which is what this replaces. Rows older than any
    limit's window are stale and pruned opportunistically by repo.record_rate_limit_hit."""

    __tablename__ = "rate_limit_hits"
    __table_args__ = (Index("ix_rate_limit_hits_key_created_at", "key", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    key: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
