from typing import Annotated, Protocol

from fastapi import APIRouter, Depends, File, Form, Header, Request, Response, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.languages import resolve_language
from app.core.limits import MAX_AUDIO_FILE_BYTES
from app.core.rate_limit import client_ip_key, enforce_rate_limit, user_or_ip_key
from app.db import get_db
from app.models.user import User
from app.schemas.answer import AnswerReport
from app.schemas.feedback import compute_overall_score
from app.services import feedback as feedback_service
from app.services import llm, mastery, repo, stt
from app.services.interviewer_policy import policy_for
from app.services.question_orchestrator import NoQuestionAvailableError, select_next_question

router = APIRouter()

UPLOAD_CHUNK_BYTES = 256 * 1024
ALLOWED_AUDIO_CONTENT_TYPES = {"audio/webm", "audio/ogg"}
DURATION_CAP_GRACE_S = 10
IDEMPOTENCY_KEY_TTL_S = 24 * 60 * 60
MAX_IDEMPOTENCY_KEY_LENGTH = 128


def _base_content_type(content_type: str | None) -> str:
    """Strips a MIME type down to its base ("audio/webm;codecs=opus" -> "audio/webm") before
    comparing against ALLOWED_AUDIO_CONTENT_TYPES. Real bug this fixes: `MediaRecorder`
    (use-audio-recorder.ts) records with `mimeType: "audio/webm;codecs=opus"` when the browser
    supports it (most do), and the browser's own FormData/fetch sets that exact string — codecs
    parameter included — as the multipart part's Content-Type. An exact-equality check against
    the bare "audio/webm" rejected the app's own normal recordings with a 415; that's the actual
    cause of "Audio must be webm or ogg." on an otherwise-valid upload, not a format the user
    ever chose. Either way this header is just a cheap pre-filter — see the magic-byte sniffing
    below for the real validation."""
    if content_type is None:
        return ""
    return content_type.split(";", 1)[0].strip().lower()


# Magic bytes for the two containers ALLOWED_AUDIO_CONTENT_TYPES claims to accept. WebM is
# Matroska/EBML-based, so any WebM file starts with the EBML header; Ogg files start with the
# ASCII capture pattern "OggS". A client-supplied Content-Type header is just a string the
# client chose to send — the check against ALLOWED_AUDIO_CONTENT_TYPES above is a cheap,
# spoofable pre-filter, not real validation of what's actually in the file.
_WEBM_MAGIC = b"\x1a\x45\xdf\xa3"
_OGG_MAGIC = b"OggS"


def _looks_like_audio(header: bytes) -> bool:
    return header.startswith(_WEBM_MAGIC) or header.startswith(_OGG_MAGIC)


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
async def create_answer(
    request: Request,
    response: Response,
    session_id: Annotated[str, Form()],
    session_question_id: Annotated[str, Form()],
    audio: Annotated[UploadFile, File()],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> AnswerReport:
    if idempotency_key is not None and (
        len(idempotency_key) == 0 or len(idempotency_key) > MAX_IDEMPOTENCY_KEY_LENGTH
    ):
        raise ApiError(
            "invalid_idempotency_key",
            f"Idempotency-Key must be 1-{MAX_IDEMPOTENCY_KEY_LENGTH} characters.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # A retry with the same key returns the original result instead of reprocessing — before
    # the rate limit/daily cap below, since a retry (e.g. after a network drop hid a successful
    # response from the client) shouldn't cost the user any of their budget.
    if idempotency_key:
        existing = await repo.get_answer_by_idempotency_key(
            db,
            user_id=user.id,
            idempotency_key=idempotency_key,
            within_seconds=IDEMPOTENCY_KEY_TTL_S,
        )
        if existing is not None:
            existing_session = await repo.get_session_for_user(
                db, session_id=existing.session_id, user_id=user.id
            )
            if existing_session is not None:
                return await feedback_service.to_answer_report(
                    db, answer=existing, session=existing_session
                )

    # Separate from (and tighter than) the 30/day business-rule cap below: each call costs real
    # Groq usage, so a short burst still needs its own limit even for a user nowhere near the
    # daily cap. Keyed by user (get_current_user has already run as a dependency by this point,
    # so user_or_ip_key resolves to "user:<id>" in the overwhelming common case) — the primary
    # unit of abuse here is per-account.
    await enforce_rate_limit(
        request, db, scope="answers", limit=6, window_seconds=60, key_func=user_or_ip_key
    )
    # A second, looser bucket keyed purely by connection IP: defends against one IP registering
    # many accounts specifically to multiply past the per-user cap above — each account alone
    # would stay under 6/min, but all of them together from one IP would not.
    await enforce_rate_limit(
        request, db, scope="answers_ip", limit=20, window_seconds=60, key_func=client_ip_key
    )

    settings = get_settings()

    session = await repo.get_session_for_user(db, session_id=session_id, user_id=user.id)
    if session is None:
        raise ApiError(
            "session_not_found", "Session not found.", status_code=status.HTTP_404_NOT_FOUND
        )

    session_question = await repo.get_session_question_for_session(
        db, session_question_id=session_question_id, session_id=session.id
    )
    if session_question is None:
        raise ApiError(
            "question_not_found", "Question not found.", status_code=status.HTTP_404_NOT_FOUND
        )

    if await repo.get_answer_for_session_question(db, session_question_id=session_question.id):
        raise ApiError(
            "question_already_answered",
            "This question has already been answered.",
            status_code=status.HTTP_409_CONFLICT,
        )

    answers_today = await repo.count_answers_today(db, user_id=user.id)
    if answers_today >= settings.daily_answer_limit:
        raise ApiError(
            "rate_limited",
            f"Daily limit of {settings.daily_answer_limit} answers reached.",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    if _base_content_type(audio.content_type) not in ALLOWED_AUDIO_CONTENT_TYPES:
        raise ApiError(
            "unsupported_media_type",
            "Audio must be webm or ogg.",
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        )

    audio_bytes = await _read_capped(audio, MAX_AUDIO_FILE_BYTES)

    if not _looks_like_audio(audio_bytes[: len(_WEBM_MAGIC)]):
        raise ApiError(
            "invalid_audio_content",
            "The uploaded file doesn't look like a webm or ogg audio recording.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    # Transcribed in memory and never written to disk or persisted — only the resulting text
    # (and what's derived from it) gets stored.
    transcription = await stt.transcribe(
        audio_bytes,
        audio.filename or "answer.webm",
        language=resolve_language(session.language).whisper_code,
    )

    if transcription.duration_s > session.answer_cap_s + DURATION_CAP_GRACE_S:
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
        role=session.role,
        category=session_question.category,
        question_text=session_question.text,
        transcript=transcription.transcript,
        candidate_context=session.personalization_context(),
        policy=policy_for(session.interviewer_style),
        language=session.language,
    )

    answer = feedback_service.build_answer(
        session_id=session.id,
        user_id=user.id,
        question_id=session_question.question_id,
        session_question_id=session_question.id,
        question_text=session_question.text,
        category=session_question.category,
        answer_cap_s=session.answer_cap_s,
        transcription=transcription,
        feedback=llm_feedback,
    )
    answer.idempotency_key = idempotency_key
    try:
        saved = await repo.create_answer(db, answer=answer)
    except IntegrityError:
        # Lost a race against another request with the same key (the check above isn't atomic
        # with this insert) — the unique constraint on (user_id, idempotency_key) caught it
        # instead. The winner's row is what should have been returned anyway.
        await db.rollback()
        if idempotency_key:
            existing = await repo.get_answer_by_idempotency_key(
                db,
                user_id=user.id,
                idempotency_key=idempotency_key,
                within_seconds=IDEMPOTENCY_KEY_TTL_S,
            )
            if existing is not None:
                return await feedback_service.to_answer_report(db, answer=existing, session=session)
        raise

    # Feed the answer into the candidate's persistent competency model before choosing what to
    # ask next, so the very next question already reflects it.
    if session_question.competency:
        await mastery.record_answer_evidence(
            db,
            user_id=user.id,
            role=session.role,
            competency=session_question.competency,
            score_0_to_10=compute_overall_score(llm_feedback.rubric),
            level=session_question.level,
        )

    # Advance the session: either the next question in sequence, or completion.
    if session_question.sequence_number >= session.question_count:
        await repo.mark_session_completed(db, session_id=session.id)
    else:
        next_position = session_question.sequence_number + 1
        try:
            selected = await select_next_question(
                db,
                session=session,
                prior_follow_up=llm_feedback.follow_up_question,
                previous_answer_summary="; ".join(llm_feedback.improvements)[:400] or None,
            )
        except NoQuestionAvailableError:
            # No bank question left and no usable follow-up — end the session early rather than
            # leaving it stuck with no way to progress.
            await repo.mark_session_completed(db, session_id=session.id)
        else:
            await repo.create_session_question(
                db,
                session_id=session.id,
                sequence_number=next_position,
                text=selected.text,
                category=selected.category,
                source=selected.source,
                question_id=selected.question_id,
                competency=selected.competency,
                level=selected.level,
                selection_reason=selected.reason,
            )

    return await feedback_service.to_answer_report(db, answer=saved, session=session)


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
    session = await repo.get_session_for_user(db, session_id=answer.session_id, user_id=user.id)
    if session is None:
        raise ApiError(
            "session_not_found", "Session not found.", status_code=status.HTTP_404_NOT_FOUND
        )
    return await feedback_service.to_answer_report(db, answer=answer, session=session)
