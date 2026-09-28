from pydantic import BaseModel, Field, field_validator

from app.models.interview_session import (
    MAX_CANDIDATE_BACKGROUND_LENGTH,
    MAX_SKILL_LENGTH,
    MAX_SKILLS,
)


class ResumeExtraction(BaseModel):
    """Both what the LLM returns and `POST /v1/resume/parse`'s response_model — but a response
    only ever reaches the client with `is_resume=True`: app/services/llm.py's
    extract_resume_data turns `is_resume=False` into a 422 ApiError instead of returning this
    shape, so an unrecognized (non-resume) upload never round-trips a half-filled extraction
    back to the form. Every content field is optional: the LLM is explicitly told never to guess
    a value the resume doesn't actually support, so a thin or unusual resume should come back
    with nulls/an empty list rather than a fabricated biography (see app/prompts/resume.py's
    system prompt)."""

    is_resume: bool
    """Whether the uploaded document's text actually reads like a resume/CV (work experience,
    skills, education, a professional summary) rather than some other document a candidate might
    upload by mistake (a certificate, transcript, cover letter, offer letter, invoice, ...). No
    default — the model must decide every time, the same way it must always decide every other
    field, rather than this silently defaulting to "yes" if the model's response happens to omit
    it (which would ship a validation-retry-worthy bug as an always-true field instead)."""

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
