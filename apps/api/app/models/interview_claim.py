import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow

CLAIM_TYPES = (
    "numeric",
    "ownership",
    "leadership",
    "technical",
    "performance",
    "scale",
    "team_size",
    "business_impact",
    "resume",
)
CLAIM_IMPORTANCE = ("high", "medium", "low")
# `contradictory` exists for completeness of the vocabulary but is never set automatically: a
# weak follow-up answer is not evidence that a claim is false, and the product never accuses a
# candidate of lying. Everything stays "unverified" until a probe answer supports it.
CLAIM_STATUSES = ("unverified", "partially_supported", "well_supported", "contradictory")


class InterviewClaim(Base):
    """A substantive statement the candidate made (in an answer) or that their resume makes,
    which a real interviewer would probe: "reduced latency by 40%", "led a team of five". It
    steers follow-up questions and, afterwards, tells the candidate which claims need
    preparation. Always owned by `user_id` and scoped to a session."""

    __tablename__ = "interview_claims"
    __table_args__ = (Index("ix_interview_claims_session_id", "session_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Deliberately not a foreign key: answers -> session_questions -> interview_claims already
    # forms a chain, and this link is informational (claims are deleted with their session).
    answer_id: Mapped[str | None] = mapped_column(String(36))
    parent_claim_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("interview_claims.id", ondelete="SET NULL")
    )
    # "answer" (extracted from something said in the interview) or "resume".
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="answer")
    claim_text: Mapped[str] = mapped_column(String(300), nullable=False)
    claim_type: Mapped[str] = mapped_column(String(20), nullable=False)
    importance: Mapped[str] = mapped_column(String(8), nullable=False)
    metric: Mapped[str | None] = mapped_column(String(64))
    competency: Mapped[str | None] = mapped_column(String(64))
    # How many probes deep this claim already is (a probe's answer can yield a new claim whose
    # chain_depth is its parent's + 1) — bounded by the interviewer style's depth budget.
    chain_depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    probe_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    verified_depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="unverified")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
