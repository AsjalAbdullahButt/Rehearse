"""SQLAlchemy models. Import every module here so `Base.metadata` sees all tables —
Alembic's autogenerate and `Base.metadata.create_all()` in tests both depend on this."""

from app.models.answer import Answer
from app.models.base import Base
from app.models.interview_session import InterviewSession
from app.models.profile import Profile
from app.models.question import Question
from app.models.refresh_token import RefreshToken
from app.models.user import User

__all__ = [
    "Answer",
    "Base",
    "InterviewSession",
    "Profile",
    "Question",
    "RefreshToken",
    "User",
]
