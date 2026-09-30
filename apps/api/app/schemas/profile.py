from pydantic import BaseModel, Field, field_validator

from app.models.enums import Role
from app.models.interview_session import (
    MAX_CANDIDATE_BACKGROUND_LENGTH,
    MAX_SKILL_LENGTH,
    MAX_SKILLS,
)
from app.models.profile import ANSWER_CAP_CHOICES

MAX_DISPLAY_NAME_LENGTH = 255
"""Mirrors profiles.display_name's DB column (String(255)) — see app/models/profile.py."""

MAX_VOICE_NAME_LENGTH = 128
"""Mirrors profiles.voice_name's DB column (String(128)) — see app/models/profile.py. Free text
(a browser SpeechSynthesisVoice.name, e.g. "Google UK English Female"), not an enum: the set of
available voices varies per browser/OS and can't be enumerated server-side."""


class ProfileOut(BaseModel):
    display_name: str | None
    target_role: str | None
    answer_cap_s: int
    voice_name: str | None
    voice_rate: float
    candidate_background: str | None
    skills: list[str] | None
    years_experience: int | None

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    """All fields optional — PATCH semantics. `exclude_unset=True` on the router side means an
    omitted field is left alone, not reset to null. Every bound here mirrors a real DB
    constraint (see app/models/profile.py) so an invalid value is rejected at the API boundary
    rather than only at the database, and client-side validation (Settings' OptionPill choices)
    is UX, not the actual security boundary."""

    display_name: str | None = Field(default=None, max_length=MAX_DISPLAY_NAME_LENGTH)
    target_role: Role | None = None
    answer_cap_s: int | None = None
    voice_name: str | None = Field(default=None, max_length=MAX_VOICE_NAME_LENGTH)
    voice_rate: float | None = Field(default=None, ge=0.5, le=2.0)
    # The saved "resume memory" — same caps as SessionCreate's matching fields (see
    # app/models/interview_session.py), reused rather than duplicated.
    candidate_background: str | None = Field(
        default=None, max_length=MAX_CANDIDATE_BACKGROUND_LENGTH
    )
    skills: list[str] | None = None
    years_experience: int | None = Field(default=None, ge=0, le=80)

    @field_validator("display_name", "voice_name", "candidate_background")
    @classmethod
    def _trim_whitespace(cls, value: str | None) -> str | None:
        if value is None:
            return value
        trimmed = value.strip()
        # An explicitly-sent empty/whitespace-only string clears the field, same as sending
        # null — trimming to None here rather than persisting "" keeps that one clearing
        # behavior instead of two different "empty" representations in the DB.
        return trimmed or None

    @field_validator("answer_cap_s")
    @classmethod
    def _valid_answer_cap(cls, value: int | None) -> int | None:
        if value is not None and value not in ANSWER_CAP_CHOICES:
            raise ValueError(f"answer_cap_s must be one of {ANSWER_CAP_CHOICES}")
        return value

    @field_validator("skills")
    @classmethod
    def _clean_skills(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        cleaned = [skill.strip() for skill in value if skill.strip()]
        if len(cleaned) > MAX_SKILLS:
            raise ValueError(f"skills can have at most {MAX_SKILLS} entries")
        for skill in cleaned:
            if len(skill) > MAX_SKILL_LENGTH:
                raise ValueError(f"each skill must be at most {MAX_SKILL_LENGTH} characters")
        return cleaned or None
