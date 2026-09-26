from typing import Annotated, Protocol

from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.rate_limit import limiter, user_or_ip_key
from app.db import get_db
from app.models.profile import ANSWER_CAP_CHOICES
from app.models.user import User
from app.schemas.answer import AnswerReport
from app.services import feedback as feedback_service
from app.services import llm, repo, stt

router = APIRouter()

MAX_AUDIO_BYTES = 4 * 1024 * 1024
UPLOAD_CHUNK_BYTES = 256 * 1024
ALLOWED_AUDIO_CONTENT_TYPES = {"audio/webm", "audio/ogg"}
DURATION_CAP_GRACE_S = 10


class _ReadableUpload(Protocol):
    """Structural type for what `_read_capped` actually needs — just chunked `.read()` — so a
    lightweight test double doesn't have to satisfy `UploadFile`'s full concrete interface
    (which needs a real `SpooledTemporaryFile`) to stand in for one here."""

    async def read(self, size: int = -1) -> bytes: ...


async def _read_capped(audio: _ReadableUpload, max_bytes: int) -> bytes:
    """Reads `audio` in fixed-size chunks, aborting as soon as the cumulative size exceeds
    `max_bytes` — so a payload far over the cap is never fully materialized into a single
    `bytes` object by this function, unlike a single unbounded `.read()` followed by a length
    check. (Starlette's own multipart parser has already spooled the raw body before this
    function runs; this bounds *this function's* memory use, not the framework's.)"""
    chunks = bytearray()
    while True:
        chunk = await audio.read(UPLOAD_CHUNK_BYTES)
        if not chunk:
            break
        chunks.extend(chunk)
        if len(chunks) > max_bytes:
            raise ApiError(
                "payload_too_large",
                "Audio file exceeds the 4MB limit.",
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            )
    return bytes(chunks)


@router.post("/answers", response_model=AnswerReport, status_code=status.HTTP_201_CREATED)
# Separate from (and tighter than) the 30/day business-rule cap below: each call costs real
# Groq usage, so a short burst still needs its own limit even for a user nowhere near the
# daily cap. Keyed by user, not IP — the meaningful unit of abuse here is per-account.
@limiter.limit(  # pyright: ignore[reportUnknownMemberType, reportUntypedFunctionDecorator]
    "6/minute", key_func=user_or_ip_key
)
async def create_answer(
    request: Request,
    response: Response,
    session_id: Annotated[str, Form()],
    question_id: Annotated[str, Form()],
    time_cap_s: Annotated[int, Form()],
    audio: Annotated[UploadFile, File()],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnswerReport:
    settings = get_settings()

    if time_cap_s not in ANSWER_CAP_CHOICES:
        raise ApiError(
            "invalid_time_cap",
            f"time_cap_s must be one of {ANSWER_CAP_CHOICES}.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    session = await repo.get_session_for_user(db, session_id=session_id, user_id=user.id)
    if session is None:
        raise ApiError(
            "session_not_found", "Session not found.", status_code=status.HTTP_404_NOT_FOUND
        )

    question = await repo.get_question_by_id(db, question_id=question_id)
    if question is None:
        raise ApiError(
            "question_not_found", "Question not found.", status_code=status.HTTP_404_NOT_FOUND
        )

    answers_today = await repo.count_answers_today(db, user_id=user.id)
    if answers_today >= settings.daily_answer_limit:
        raise ApiError(
            "rate_limited",
            f"Daily limit of {settings.daily_answer_limit} answers reached.",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    if audio.content_type not in ALLOWED_AUDIO_CONTENT_TYPES:
        raise ApiError(
            "unsupported_media_type",
            "Audio must be webm or ogg.",
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        )

    audio_bytes = await _read_capped(audio, MAX_AUDIO_BYTES)

    # Transcribed in memory and never written to disk or persisted — only the resulting text
    # (and what's derived from it) gets stored.
    transcription = await stt.transcribe(audio_bytes, audio.filename or "answer.webm")

    if transcription.duration_s > time_cap_s + DURATION_CAP_GRACE_S:
        raise ApiError(
            "duration_exceeds_cap",
            "Recording exceeds the configured time cap.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    if not transcription.transcript.strip():
        raise ApiError(
            "empty_transcript",
            "No speech was detected in the recording.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    llm_feedback = await llm.generate_feedback(
        role=session.role, question_text=question.text, transcript=transcription.transcript
    )

    answer = feedback_service.build_answer(
        session_id=session.id,
        user_id=user.id,
        question_id=question.id,
        question_text=question.text,
        transcription=transcription,
        feedback=llm_feedback,
    )
    saved = await repo.create_answer(db, answer=answer)
    return feedback_service.to_answer_report(saved)


@router.get("/answers/{answer_id}", response_model=AnswerReport)
async def get_answer(
    answer_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnswerReport:
    answer = await repo.get_answer_for_user(db, answer_id=answer_id, user_id=user.id)
    if answer is None:
        raise ApiError(
            "answer_not_found", "Answer not found.", status_code=status.HTTP_404_NOT_FOUND
        )
    return feedback_service.to_answer_report(answer)
