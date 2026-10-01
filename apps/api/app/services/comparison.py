"""Compares attempts at the same question. Everything here is computed from stored scores and
metrics — no LLM call and nothing invented: "what improved" is a rubric component that rose by at
least `MEANINGFUL_DELTA`, "what stayed weak" is one still below `WEAK_BELOW`, and "focus next"
is the lowest-scoring component of the latest attempt."""

from dataclasses import dataclass

from app.schemas.attempts import AttemptComparison, AttemptOut, ComponentDelta
from app.schemas.feedback import rubric_overall_score

MEANINGFUL_DELTA = 1.0
WEAK_BELOW = 6.0
# Negligible changes in a percentage-like metric aren't worth calling an improvement.
_FILLER_RATE_EPSILON = 0.5


@dataclass(frozen=True)
class AttemptData:
    answer_id: str
    attempt_number: int
    transcript: str
    created_at: object
    rubric: dict[str, object] | None
    clarity: int | None
    wpm: float
    filler_count: int
    word_count: int
    improvements: list[str]


def _components(rubric: dict[str, object] | None) -> dict[str, float]:
    return {
        key: float(value)
        for key, value in (rubric or {}).items()
        if key != "category" and isinstance(value, int | float)
    }


def _filler_rate(filler_count: int, word_count: int) -> float:
    return round(filler_count / word_count * 100, 2) if word_count else 0.0


def _label(key: str) -> str:
    return key.replace("_", " ")


def _out(attempt: AttemptData) -> AttemptOut:
    overall = rubric_overall_score(attempt.rubric)
    return AttemptOut(
        answer_id=attempt.answer_id,
        attempt_number=attempt.attempt_number,
        transcript=attempt.transcript,
        created_at=attempt.created_at,  # type: ignore[arg-type]
        overall_score=round(overall, 2) if overall is not None else None,
        clarity=attempt.clarity,
        wpm=attempt.wpm,
        filler_rate_per_100_words=_filler_rate(attempt.filler_count, attempt.word_count),
        rubric=_components(attempt.rubric),
    )


def compare_attempts(attempts: list[AttemptData]) -> AttemptComparison:
    """`attempts` oldest first, at least one. With a single attempt there is nothing to compare
    yet, so deltas/improved are empty and only the focus advice is filled in."""
    ordered = sorted(attempts, key=lambda a: a.attempt_number)
    first, latest = ordered[0], ordered[-1]
    first_components, latest_components = _components(first.rubric), _components(latest.rubric)
    has_comparison = len(ordered) > 1

    deltas = [
        ComponentDelta(
            key=key,
            before=first_components[key],
            after=latest_components[key],
            delta=round(latest_components[key] - first_components[key], 2),
        )
        for key in latest_components
        if has_comparison and key in first_components
    ]
    improved = [d.key for d in deltas if d.delta >= MEANINGFUL_DELTA]
    regressed = [d.key for d in deltas if d.delta <= -MEANINGFUL_DELTA]
    remained_weak = sorted(key for key, value in latest_components.items() if value < WEAK_BELOW)
    focus = min(latest_components, key=lambda k: (latest_components[k], k), default=None)

    first_overall = rubric_overall_score(first.rubric)
    latest_overall = rubric_overall_score(latest.rubric)
    overall_delta = (
        round(latest_overall - first_overall, 2)
        if has_comparison and first_overall is not None and latest_overall is not None
        else None
    )
    filler_delta = (
        round(
            _filler_rate(latest.filler_count, latest.word_count)
            - _filler_rate(first.filler_count, first.word_count),
            2,
        )
        if has_comparison
        else None
    )

    summary: list[str] = []
    if improved:
        summary.append("Improved: " + ", ".join(_label(k) for k in improved) + ".")
    if regressed:
        summary.append("Slipped: " + ", ".join(_label(k) for k in regressed) + ".")
    if has_comparison and not improved and not regressed:
        summary.append("No component moved by a full point between the first and latest attempt.")
    if remained_weak:
        summary.append("Still weak: " + ", ".join(_label(k) for k in remained_weak) + ".")
    if filler_delta is not None and abs(filler_delta) >= _FILLER_RATE_EPSILON:
        direction = "dropped" if filler_delta < 0 else "rose"
        summary.append(f"Filler words {direction} by {abs(filler_delta)} per 100 words.")
    if focus is not None:
        advice = latest.improvements[0] if latest.improvements else None
        summary.append(f"Focus next on {_label(focus)}" + (f": {advice}" if advice else "."))

    return AttemptComparison(
        attempts=[_out(a) for a in ordered],
        overall_delta=overall_delta,
        components=deltas,
        improved=improved,
        regressed=regressed,
        remained_weak=remained_weak,
        focus_next=focus,
        filler_rate_delta=filler_delta,
        wpm_delta=round(latest.wpm - first.wpm, 2) if has_comparison else None,
        summary=summary,
    )
