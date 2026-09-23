from pydantic import BaseModel


class WordTiming(BaseModel):
    word: str
    start: float
    end: float


class TranscriptionResult(BaseModel):
    transcript: str
    words: list[WordTiming]
    duration_s: float
