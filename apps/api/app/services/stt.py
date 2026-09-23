from typing import Any, cast

from fastapi import status
from groq import APIStatusError, AsyncGroq

from app.core.config import get_settings
from app.core.errors import ApiError
from app.schemas.transcription import TranscriptionResult, WordTiming

# Told to transcribe verbatim so filler words survive — metrics.py needs "um"/"uh"/"like" in
# the transcript it counts fillers from, not a cleaned-up version.
FILLER_PRESERVING_PROMPT = (
    "Transcribe verbatim, exactly as spoken, including filler words such as um, uh, like, "
    "and you know. Do not clean up or paraphrase the speech."
)

_REQUEST_TIMEOUT_S = 30.0


def _client() -> AsyncGroq:
    settings = get_settings()
    return AsyncGroq(api_key=settings.groq_api_key, timeout=_REQUEST_TIMEOUT_S)


def _is_retryable(exc: APIStatusError) -> bool:
    return exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS or exc.status_code >= 500


async def _call(client: AsyncGroq, audio_bytes: bytes, filename: str, model: str) -> Any:
    return await client.audio.transcriptions.create(
        file=(filename, audio_bytes),
        model=model,  # type: ignore[arg-type]
        response_format="verbose_json",
        timestamp_granularities=["word", "segment"],
        prompt=FILLER_PRESERVING_PROMPT,
    )


async def transcribe(audio_bytes: bytes, filename: str) -> TranscriptionResult:
    """Transcribes audio via Groq Whisper, with one retry on a 429/5xx. Any other failure
    (bad request, auth, non-retryable) surfaces immediately as a 502 — retrying those would
    just waste a second call on an error that won't change."""
    settings = get_settings()
    client = _client()

    try:
        response = await _call(client, audio_bytes, filename, settings.groq_stt_model)
    except APIStatusError as exc:
        if not _is_retryable(exc):
            raise ApiError(
                "stt_failed", "Transcription failed.", status_code=status.HTTP_502_BAD_GATEWAY
            ) from exc
        try:
            response = await _call(client, audio_bytes, filename, settings.groq_stt_model)
        except APIStatusError as retry_exc:
            raise ApiError(
                "stt_failed",
                "Transcription failed after retry.",
                status_code=status.HTTP_502_BAD_GATEWAY,
            ) from retry_exc

    # response_format="verbose_json" returns `words`/`segments`/`duration` alongside `text`,
    # but the SDK's `Transcription` model only declares `text` — the rest arrive as pydantic
    # "extra" fields, so they're read via model_extra rather than static attribute access.
    extra = cast(dict[str, Any], response.model_extra or {})
    words_raw = cast(list[dict[str, Any]], extra.get("words") or [])
    words = [WordTiming(word=w["word"], start=w["start"], end=w["end"]) for w in words_raw]

    duration_raw = extra.get("duration")
    duration_s = (
        float(duration_raw) if duration_raw is not None else (words[-1].end if words else 0.0)
    )

    return TranscriptionResult(transcript=response.text, words=words, duration_s=duration_s)
