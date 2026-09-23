from datetime import datetime

from sqlalchemy import DECIMAL, CheckConstraint, DateTime, ForeignKey, Integer, String
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
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
