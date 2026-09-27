from pydantic import BaseModel, Field, field_validator

from app.models.interview_session import (
    MAX_CANDIDATE_BACKGROUND_LENGTH,
    MAX_SKILL_LENGTH,
    MAX_SKILLS,
)


class ResumeExtraction(BaseModel):
    """What `POST /v1/resume/parse` hands back to pre-fill (not auto-submit — the web form keeps
    every field editable) SessionSetupForm's personalization inputs. Every field is optional: the
    LLM is explicitly told never to guess a value the resume doesn't actually support, so a thin
    or unusual resume should come back with nulls/an empty list rather than a fabricated
    biography (see app/prompts/resume.py's system prompt)."""

    candidate_background: str | None = Field(
        default=None, max_length=MAX_CANDIDATE_BACKGROUND_LENGTH
    )
    skills: list[str] = Field(default_factory=list)
    years_experience: int | None = Field(default=None, ge=0, le=80)

    @field_validator("skills")
    @classmethod
    def _clean_skills(cls, value: list[str]) -> list[str]:
        # Truncates/clips instead of raising like SessionCreate's equivalent validator does: this
        # is the LLM's own output, not a user directly asking for something out of bounds, so a
        # slightly-over-length skill or a 21st item is silently trimmed to fit rather than
        # failing the whole extraction (which llm.py would then retry, wasting a call, for
        # something this cheap to just fix).
        cleaned = [skill.strip()[:MAX_SKILL_LENGTH] for skill in value if skill.strip()]
        return cleaned[:MAX_SKILLS]
