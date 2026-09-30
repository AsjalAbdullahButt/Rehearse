from datetime import datetime

from sqlalchemy import DECIMAL, JSON, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow

ANSWER_CAP_CHOICES = (60, 120, 180, 300)


class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = (
        CheckConstraint(
            f"answer_cap_s IN ({', '.join(str(c) for c in ANSWER_CAP_CHOICES)})",
            name="ck_profiles_answer_cap_s",
        ),
        CheckConstraint("voice_rate BETWEEN 0.5 AND 2.0", name="ck_profiles_voice_rate"),
    )

    id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    display_name: Mapped[str | None] = mapped_column(String(255))
    target_role: Mapped[str | None] = mapped_column(String(64))
    answer_cap_s: Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    voice_name: Mapped[str | None] = mapped_column(String(128))
    voice_rate: Mapped[float] = mapped_column(DECIMAL(3, 2), nullable=False, default=1.0)
    # A saved "resume memory" — either typed directly into Settings, or pre-filled there via the
    # same ResumeUpload component SessionSetupForm uses (SettingsForm's `onExtracted` handler),
    # then saved through the ordinary `PATCH /v1/profile` this whole form already goes through —
    # no separate save-on-upload endpoint. So a candidate doesn't have to re-upload/re-type the
    # same background for every new session. Purely a pre-fill default: SessionSetupForm always
    # shows these as editable, never auto-submits them, same as the per-session resume upload
    # always has.
    # Same column shapes/caps as sessions.candidate_background/skills/years_experience (see
    # app/models/interview_session.py's MAX_CANDIDATE_BACKGROUND_LENGTH/MAX_SKILLS/
    # MAX_SKILL_LENGTH, reused rather than duplicated in schemas/profile.py).
    candidate_background: Mapped[str | None] = mapped_column(Text)
    skills: Mapped[list[str] | None] = mapped_column(JSON)
    years_experience: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
