from typing import Literal

from pydantic import BaseModel


class WordTiming(BaseModel):
    word: str
    start: float
    end: float


class TranscriptionResult(BaseModel):
    transcript: str
    words: list[WordTiming]
    duration_s: float


class TranscriptPart(BaseModel):
    """One segment of a transcript prepared for word-level UI highlighting (the web app's
    TranscriptHighlight component). `text` is set for "text"/"filler" parts, `seconds` for
    "pause" parts — kept as a flat optional-field model rather than a tagged union because
    this is a wire schema, not a domain type; the web app narrows it back into its own
    discriminated union on read."""

    type: Literal["text", "filler", "pause"]
    text: str | None = None
    seconds: float | None = None
