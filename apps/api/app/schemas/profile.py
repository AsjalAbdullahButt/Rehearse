from pydantic import BaseModel, Field, field_validator

from app.models.profile import ANSWER_CAP_CHOICES


class ProfileOut(BaseModel):
    display_name: str | None
    target_role: str | None
    answer_cap_s: int
    voice_name: str | None
    voice_rate: float

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    """All fields optional — PATCH semantics. `exclude_unset=True` on the router side means an
    omitted field is left alone, not reset to null."""

    display_name: str | None = None
    target_role: str | None = None
    answer_cap_s: int | None = None
    voice_name: str | None = None
    voice_rate: float | None = Field(default=None, ge=0.5, le=2.0)

    @field_validator("answer_cap_s")
    @classmethod
    def _valid_answer_cap(cls, value: int | None) -> int | None:
        if value is not None and value not in ANSWER_CAP_CHOICES:
            raise ValueError(f"answer_cap_s must be one of {ANSWER_CAP_CHOICES}")
        return value
