import io

from fastapi import status
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from app.core.errors import ApiError

# A resume is 1-3 pages; anything past this is either a multi-document dump or an attempt to
# make this endpoint do a lot of expensive parsing/LLM work for one upload — only the first few
# pages are read, not rejected outright, so a slightly-over-length CV still works.
MAX_PAGES_READ = 6
# Roughly 2-3 dense resume pages of plain text; caps what gets sent to the LLM regardless of how
# much text a pathological PDF (e.g. a huge invisible text layer) contains.
MAX_EXTRACTED_CHARS = 20_000
MIN_EXTRACTED_CHARS = 50


def extract_text(pdf_bytes: bytes) -> str:
    """Extracts plain text from an uploaded resume PDF, entirely in memory — the bytes and the
    `PdfReader` are never written to disk, matching app/services/stt.py's audio handling. Raises
    `ApiError` (422) for anything that isn't a readable, text-bearing PDF: a corrupt/encrypted
    file, or a scanned image with no text layer (OCR is out of scope — see AGENTS.md's known
    gaps)."""
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except (PdfReadError, ValueError) as exc:
        raise ApiError(
            "invalid_resume_content",
            "That file doesn't look like a readable PDF.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        ) from exc

    if reader.is_encrypted:
        raise ApiError(
            "invalid_resume_content",
            "This PDF is password-protected — please upload an unprotected copy.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    pieces: list[str] = []
    total_len = 0
    try:
        for page in reader.pages[:MAX_PAGES_READ]:
            text = page.extract_text() or ""
            pieces.append(text)
            total_len += len(text)
            if total_len >= MAX_EXTRACTED_CHARS:
                break
    except (PdfReadError, ValueError) as exc:
        raise ApiError(
            "invalid_resume_content",
            "That file doesn't look like a readable PDF.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        ) from exc

    extracted = "\n".join(pieces).strip()[:MAX_EXTRACTED_CHARS]
    if len(extracted) < MIN_EXTRACTED_CHARS:
        raise ApiError(
            "empty_resume_text",
            "Couldn't find readable text in that PDF — it may be a scanned image without a "
            "text layer.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    return extracted
