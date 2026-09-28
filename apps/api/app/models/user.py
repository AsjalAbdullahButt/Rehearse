import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # Baked into every access/refresh JWT as the "ver" claim (see core/auth.py's _encode_token)
    # and checked against this live column on every authenticated request/refresh
    # (check_token_version). Bumped by change-password/logout-all so an already-issued token —
    # which the refresh_tokens revocation table alone can't reach for *access* tokens — stops
    # working immediately instead of drifting on until its own TTL expires.
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
