"""Structured LLM outputs for interview planning (job analysis) and question generation. Both are
validated here before anything touches the database or an interview — the model's output is a
proposal, never trusted state."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

MAX_PLAN_COMPETENCIES = 12


class AnalyzedCompetency(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    weight: float = Field(gt=0, le=100)
    importance: Literal["required", "preferred"] = "required"
    resume_evidence: Literal["strong", "medium", "basic", "missing", "unknown"] = "unknown"


class JobAnalysis(BaseModel):
    seniority: Literal["intern", "junior", "mid", "senior", "lead", "unknown"] = "unknown"
    competencies: list[AnalyzedCompetency] = Field(min_length=1, max_length=MAX_PLAN_COMPETENCIES)

    @field_validator("competencies")
    @classmethod
    def _total_weight_positive(cls, value: list[AnalyzedCompetency]) -> list[AnalyzedCompetency]:
        if sum(c.weight for c in value) <= 0:
            raise ValueError("competency weights must sum to a positive number")
        return value


class GeneratedQuestion(BaseModel):
    text: str = Field(min_length=15, max_length=500)
    subtopic: str | None = Field(default=None, max_length=80)
