"""SQLAlchemy models. Import every module here so `Base.metadata` sees all tables —
Alembic's autogenerate and `Base.metadata.create_all()` in tests both depend on this."""

from app.models.answer import Answer
from app.models.base import Base
from app.models.candidate_competency import CandidateCompetency
from app.models.email_verification_token import EmailVerificationToken
from app.models.interview_claim import InterviewClaim
from app.models.interview_session import InterviewSession
from app.models.job_target import JobCompetency, JobTarget
from app.models.password_reset_token import PasswordResetToken
from app.models.profile import Profile
from app.models.question import Question
from app.models.rate_limit_counter import RateLimitCounter
from app.models.refresh_token import RefreshToken
from app.models.report_share import ReportShare
from app.models.session_question import SessionQuestion
from app.models.user import User

__all__ = [
    "Answer",
    "Base",
    "CandidateCompetency",
    "EmailVerificationToken",
    "InterviewClaim",
    "InterviewSession",
    "JobCompetency",
    "JobTarget",
    "PasswordResetToken",
    "Profile",
    "Question",
    "RateLimitCounter",
    "ReportShare",
    "RefreshToken",
    "SessionQuestion",
    "User",
]
