from datetime import timedelta
from typing import cast

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.errors import ApiError
from app.core.rate_limit import enforce_rate_limit, user_or_ip_key
from app.db import get_db
from app.models.base import utcnow
from app.models.report_share import ReportShare
from app.models.user import User
from app.schemas.report_share import (
    ReportShareCreate,
    ReportShareOut,
    ShareAudience,
    SharedReportOut,
)
from app.services import feedback as feedback_service
from app.services import repo, report_sharing
from app.services.session_summary import build_session_summary

router = APIRouter()

MAX_PUBLIC_TOKEN_LENGTH = 128


def _share_out(share: ReportShare, *, token: str | None = None) -> ReportShareOut:
    now = utcnow()
    is_active = share.revoked_at is None and (share.expires_at is None or share.expires_at > now)
    return ReportShareOut(
        id=share.id,
        answer_id=share.answer_id,
        audience=cast(ShareAudience, share.audience),
        note=share.note,
        expires_at=share.expires_at,
        revoked_at=share.revoked_at,
        created_at=share.created_at,
        last_accessed_at=share.last_accessed_at,
        is_active=is_active,
        include_transcript=share.include_transcript,
        token=token,
        url=f"/shared/reports/{token}" if token else None,
    )


@router.post(
    "/reports/{answer_id}/share", response_model=ReportShareOut, status_code=status.HTTP_201_CREATED
)
async def create_report_share(
    request: Request,
    answer_id: str,
    body: ReportShareCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportShareOut:
    answer = await repo.get_answer_for_user(db, answer_id=answer_id, user_id=user.id)
    if answer is None:
        raise ApiError(
            "answer_not_found", "Answer not found.", status_code=status.HTTP_404_NOT_FOUND
        )
    await enforce_rate_limit(
        request, db, scope="report_shares", limit=10, window_seconds=3600, key_func=user_or_ip_key
    )

    token = report_sharing.new_share_token()
    expires_at = (
        utcnow() + timedelta(days=body.expires_in_days)
        if body.expires_in_days is not None
        else None
    )
    share = await repo.create_report_share(
        db,
        share=ReportShare(
            user_id=user.id,
            answer_id=answer.id,
            token_hash=report_sharing.hash_share_token(token),
            audience=body.audience,
            note=body.note,
            include_transcript=body.include_transcript,
            expires_at=expires_at,
        ),
    )
    return _share_out(share, token=token)


@router.get("/reports/{answer_id}/shares", response_model=list[ReportShareOut])
async def list_report_shares(
    answer_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ReportShareOut]:
    answer = await repo.get_answer_for_user(db, answer_id=answer_id, user_id=user.id)
    if answer is None:
        raise ApiError(
            "answer_not_found", "Answer not found.", status_code=status.HTTP_404_NOT_FOUND
        )
    shares = await repo.list_report_shares(db, answer_id=answer.id, user_id=user.id)
    return [_share_out(share) for share in shares]


@router.delete("/reports/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_report_share(
    share_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    revoked = await repo.revoke_report_share(db, share_id=share_id, user_id=user.id)
    if not revoked:
        raise ApiError(
            "share_not_found", "Share link not found.", status_code=status.HTTP_404_NOT_FOUND
        )


@router.get("/shared-reports/{token}", response_model=SharedReportOut)
async def get_shared_report(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> SharedReportOut:
    if len(token) == 0 or len(token) > MAX_PUBLIC_TOKEN_LENGTH:
        raise ApiError(
            "share_not_found", "Shared report not found.", status_code=status.HTTP_404_NOT_FOUND
        )

    share = await repo.get_active_report_share_by_hash(
        db, token_hash=report_sharing.hash_share_token(token)
    )
    if share is None:
        raise ApiError(
            "share_not_found", "Shared report not found.", status_code=status.HTTP_404_NOT_FOUND
        )

    answer = await repo.get_answer_for_user(db, answer_id=share.answer_id, user_id=share.user_id)
    if answer is None:
        raise ApiError(
            "share_not_found", "Shared report not found.", status_code=status.HTTP_404_NOT_FOUND
        )
    session = await repo.get_session_for_user(
        db, session_id=answer.session_id, user_id=share.user_id
    )
    if session is None:
        raise ApiError(
            "share_not_found", "Shared report not found.", status_code=status.HTTP_404_NOT_FOUND
        )

    await repo.mark_report_share_accessed(db, share=share)
    report = await feedback_service.to_answer_report(db, answer=answer, session=session)
    # Enforced from the link itself, never from a query parameter the viewer controls.
    if not share.include_transcript:
        report.transcript = ""
        report.transcript_parts = []
    summary = await build_session_summary(db, session=session)
    return SharedReportOut(share=_share_out(share), report=report, session=summary)
