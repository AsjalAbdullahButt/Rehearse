from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator


class BehavioralRubric(BaseModel):
    category: Literal["behavioral"] = "behavioral"
    situation: int = Field(ge=0, le=10)
    task: int = Field(ge=0, le=10)
    action: int = Field(ge=0, le=10)
    result: int = Field(ge=0, le=10)

    def component_scores(self) -> list[int]:
        return [self.situation, self.task, self.action, self.result]


class TechnicalRubric(BaseModel):
    category: Literal["technical"] = "technical"
    correctness: int = Field(ge=0, le=10)
    depth: int = Field(ge=0, le=10)
    tradeoffs: int = Field(ge=0, le=10)
    communication: int = Field(ge=0, le=10)

    def component_scores(self) -> list[int]:
        return [self.correctness, self.depth, self.tradeoffs, self.communication]


class SituationalRubric(BaseModel):
    category: Literal["situational"] = "situational"
    problem_framing: int = Field(ge=0, le=10)
    prioritization: int = Field(ge=0, le=10)
    judgment: int = Field(ge=0, le=10)
    communication: int = Field(ge=0, le=10)

    def component_scores(self) -> list[int]:
        return [self.problem_framing, self.prioritization, self.judgment, self.communication]


# Backward-compat alias: pre-Phase-4 code (and persisted rows) called this StarScores. The
# shape is identical to BehavioralRubric — kept as a real alias, not a duplicate class, so old
# `Answer.rubric` JSON blobs with `{"situation":...,"task":...,"action":...,"result":...}`
# still validate without a data migration.
StarScores = BehavioralRubric

Rubric = Annotated[
    BehavioralRubric | TechnicalRubric | SituationalRubric,
    Field(discriminator="category"),
]


def rubric_overall_score(rubric_data: dict[str, object] | None) -> float | None:
    """A rubric-shape-agnostic average of a *stored* rubric dict's numeric component scores —
    used by progress/session-summary aggregation, which needs "how well did this answer score
    overall" without caring whether it's a 4-field behavioral, technical, or situational rubric.
    Skips the "category" discriminator key; returns None for an answer with no rubric at all.
    (compute_overall_score below is the validated-model twin, used when a full Rubric object —
    not just its raw persisted dict — is already in hand.)"""
    if not rubric_data:
        return None
    scores = [
        value
        for key, value in rubric_data.items()
        if key != "category" and isinstance(value, int | float)
    ]
    return sum(scores) / len(scores) if scores else None


def compute_overall_score(rubric: BehavioralRubric | TechnicalRubric | SituationalRubric) -> float:
    """The overall score is always computed here, in application code, from the rubric's
    already-validated 0-10 component scores — never asked of the LLM as a separate free-
    floating number (a model asked to also invent an "overall score" tends to anchor on vibes
    rather than its own component ratings, and the two can end up inconsistent)."""
    scores = rubric.component_scores()
    return round(sum(scores) / len(scores), 2)


class LLMFeedback(BaseModel):
    """Everything the LLM is responsible for judging. Never filler counts, WPM, or pauses —
    those are computed in app/services/metrics.py and are never sent to the model to guess.

    `rubric` is a discriminated union: which of the three shapes comes back depends on the
    question's category, which the prompt is told explicitly (see app/prompts/feedback.py) —
    generate_feedback() double-checks the returned category matches what was asked for.

    `rewritten_answer` (behavioral) and `reference_answer` (technical/situational) are mutually
    exclusive by rubric category — see the validator below and Phase 6's reasoning: a
    behavioral rewrite must preserve the candidate's real facts, a technical reference answer
    doesn't need to (there's no personal history to misrepresent)."""

    rubric: Rubric
    clarity: int = Field(ge=0, le=10)
    on_topic: bool
    strengths: list[str] = Field(min_length=1, max_length=3)
    improvements: list[str] = Field(min_length=1, max_length=3)
    # Short verbatim-or-near-verbatim quotes from the transcript backing the feedback above.
    # generate_feedback() drops any quote that doesn't actually appear in the transcript rather
    # than trusting the model not to fabricate one — see app/services/feedback.py.
    evidence: list[str] = Field(default_factory=list, max_length=5)
    rambling_notes: str
    rewritten_answer: str | None = None
    reference_answer: str | None = None
    # STAR (or rubric-equivalent) elements the candidate didn't actually cover — named as
    # missing rather than silently invented when building rewritten_answer/reference_answer.
    missing_information: list[str] = Field(default_factory=list)
    follow_up_question: str

    @model_validator(mode="after")
    def _answer_field_matches_category(self) -> "LLMFeedback":
        if self.rubric.category == "behavioral":
            if not self.rewritten_answer:
                raise ValueError("behavioral feedback must include a non-empty rewritten_answer")
            if self.reference_answer:
                raise ValueError("behavioral feedback must not include reference_answer")
        else:
            if not self.reference_answer:
                raise ValueError(
                    "technical/situational feedback must include a non-empty reference_answer"
                )
            if self.rewritten_answer:
                raise ValueError("technical/situational feedback must not include rewritten_answer")
        return self


class FeedbackReport(BaseModel):
    """Same fields as LLMFeedback, for reading a *persisted* answer back rather than validating
    a fresh LLM response. Deliberately has none of LLMFeedback's strict cross-field validation
    (e.g. rewritten_answer XOR reference_answer) — a legacy row from before Phase 4, or any
    other edge case in stored data, must still render as a report instead of raising.
    LLMFeedback stays the strict contract used only to validate what the model just returned;
    this is the permissive one used only for display."""

    rubric: Rubric
    clarity: int
    on_topic: bool
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    rambling_notes: str = ""
    rewritten_answer: str | None = None
    reference_answer: str | None = None
    missing_information: list[str] = Field(default_factory=list)
    follow_up_question: str = ""
