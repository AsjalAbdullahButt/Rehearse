import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class RateLimitCounter(Base):
    """A durable, cross-instance, fixed-window rate limit: one row per (key, window_start)
    bucket, incremented via a single atomic UPSERT (see app/services/repo.py's
    record_rate_limit_hit) rather than counted from a table of individual per-request rows the
    way the earlier RateLimitHit model was. That design's separate INSERT-then-SELECT-COUNT
    wasn't atomic — two requests racing inside the same window could both read a count below the
    limit and both be let through when only one should have been. The UPSERT here
    (`INSERT ... ON DUPLICATE KEY UPDATE` on MySQL, `INSERT ... ON CONFLICT DO UPDATE` on the
    SQLite used in tests) is a single statement serialized by the unique index on
    (key, window_start), so a concurrent increment against the same bucket can't be lost.

    Documented tradeoff: this is a *fixed* window, not the previous *sliding* one — a burst can
    land up to ~2x the configured limit if it straddles a window boundary (half in the tail of
    one bucket, half in the head of the next), a well-known characteristic of fixed-window
    counters. That's accepted here in exchange for true atomicity without an app-level lock or a
    dedicated Redis/Valkey instance this project's free-tier infra doesn't have — see
    record_rate_limit_hit's docstring for what guarantee this does and doesn't provide."""

    __tablename__ = "rate_limit_counters"
    __table_args__ = (
        UniqueConstraint("key", "window_start", name="uq_rate_limit_counters_key_window"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    key: Mapped[str] = mapped_column(String(255), nullable=False)
    window_start: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    hits: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )
