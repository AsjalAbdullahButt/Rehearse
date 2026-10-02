from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.answer import AnswerReport
from app.schemas.session import SessionSummary

ShareAudience = Literal["mentor", "recruiter", "professor"]


class ReportShareCreate(BaseModel):
    audience: ShareAudience = "mentor"
    expires_in_days: int | None = Field(default=14, ge=1, le=90)
    note: str | None = Field(default=None, max_length=500)


class ReportShareOut(BaseModel):
    id: str
    answer_id: str
    audience: ShareAudience
    note: str | None
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime
    last_accessed_at: datetime | None
    is_active: bool
    url: str | None = None
    token: str | None = None


class SharedReportOut(BaseModel):
    share: ReportShareOut
    report: AnswerReport
    session: SessionSummary
