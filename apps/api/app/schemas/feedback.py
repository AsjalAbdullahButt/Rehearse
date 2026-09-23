from pydantic import BaseModel, Field, field_validator


class StarScores(BaseModel):
    situation: int = Field(ge=0, le=10)
    task: int = Field(ge=0, le=10)
    action: int = Field(ge=0, le=10)
    result: int = Field(ge=0, le=10)


class LLMFeedback(BaseModel):
    """Everything the LLM is responsible for judging. Never filler counts, WPM, or pauses —
    those are computed in app/services/metrics.py and are never sent to the model to guess."""

    star: StarScores
    clarity: int = Field(ge=0, le=10)
    on_topic: bool
    rambling_notes: str
    tips: list[str]
    sample_answer: str
    follow_up_question: str

    @field_validator("tips")
    @classmethod
    def _exactly_three_tips(cls, value: list[str]) -> list[str]:
        if len(value) != 3:
            raise ValueError("tips must contain exactly 3 items")
        return value
