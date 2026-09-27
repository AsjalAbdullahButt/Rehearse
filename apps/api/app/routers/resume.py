from typing import Annotated, Protocol

from fastapi import APIRouter, Depends, File, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.errors import ApiError
from app.core.limits import MAX_RESUME_BYTES
from app.core.rate_limit import enforce_rate_limit, user_or_ip_key
from app.db import get_db
from app.models.user import User
from app.schemas.resume import ResumeExtraction
from app.services import llm, resume_parser

router = APIRouter()

UPLOAD_CHUNK_BYTES = 256 * 1024
_PDF_MAGIC = b"%PDF-"


def _looks_like_pdf(header: bytes) -> bool:
    return header.startswith(_PDF_MAGIC)


class _ReadableUpload(Protocol):
    """Mirrors app/routers/answers.py's identically-named Protocol — see its docstring."""

    async def read(self, size: int = -1) -> bytes: ...


async def _read_capped(upload: _ReadableUpload, max_bytes: int) -> bytes:
    """Same chunked-read-with-early-abort shape as app/routers/answers.py's `_read_capped` — kept
    as its own copy rather than a shared import because the two error messages/codes differ and
    the field name ("resume" vs "audio") is baked into the message; factor out only if a third
    caller needs the exact same behavior."""
    chunks = bytearray()
    while True:
        chunk = await upload.read(UPLOAD_CHUNK_BYTES)
        if not chunk:
            break
        chunks.extend(chunk)
        if len(chunks) > max_bytes:
            raise ApiError(
                "payload_too_large",
                "Resume file exceeds the 2MB limit.",
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            )
    return bytes(chunks)


@router.post("/resume/parse", response_model=ResumeExtraction)
async def parse_resume(
    request: Request,
    resume: Annotated[UploadFile, File()],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ResumeExtraction:
    """Pre-fills SessionSetupForm's personalization fields from an uploaded resume — the file and
    its extracted text are never persisted (parsed and discarded in this request, same as answer
    audio in app/routers/answers.py), and the response only ever pre-fills form fields the user
    can review and edit before starting a session; nothing here is submitted automatically."""
    # A one-off setup action, not a per-answer cost like /answers — a looser per-user window
    # still keeps a compromised/scripted account from hammering this with resume text designed
    # to probe the extraction prompt.
    await enforce_rate_limit(
        request, db, scope="resume_parse", limit=10, window_seconds=3600, key_func=user_or_ip_key
    )

    if resume.content_type != "application/pdf":
        raise ApiError(
            "unsupported_media_type",
            "Resume must be a PDF.",
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        )

    resume_bytes = await _read_capped(resume, MAX_RESUME_BYTES)

    if not _looks_like_pdf(resume_bytes[: len(_PDF_MAGIC)]):
        raise ApiError(
            "invalid_resume_content",
            "The uploaded file doesn't look like a PDF.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    resume_text = resume_parser.extract_text(resume_bytes)
    return await llm.extract_resume_data(resume_text)
