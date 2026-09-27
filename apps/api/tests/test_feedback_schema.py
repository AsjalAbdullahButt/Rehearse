import pytest
from pydantic import ValidationError

from app.schemas.feedback import (
    BehavioralRubric,
    LLMFeedback,
    SituationalRubric,
    TechnicalRubric,
    compute_overall_score,
    rubric_overall_score,
)


def _behavioral_feedback(**overrides: object) -> LLMFeedback:
    defaults: dict[str, object] = {
        "rubric": BehavioralRubric(situation=7, task=7, action=8, result=7),
        "clarity": 8,
        "on_topic": True,
        "strengths": ["Clear structure."],
        "improvements": ["Add more detail on impact."],
        "rambling_notes": "",
        "rewritten_answer": "A cleaned-up version of the candidate's own answer.",
        "follow_up_question": "What would you do differently?",
    }
    defaults.update(overrides)
    return LLMFeedback.model_validate(defaults)


def test_behavioral_feedback_requires_rewritten_answer_not_reference_answer() -> None:
    feedback = _behavioral_feedback()
    assert feedback.rewritten_answer
    assert feedback.reference_answer is None


def test_behavioral_feedback_rejects_a_reference_answer() -> None:
    with pytest.raises(ValidationError, match="must not include reference_answer"):
        _behavioral_feedback(reference_answer="Some generated answer.")


def test_behavioral_feedback_rejects_a_missing_rewritten_answer() -> None:
    with pytest.raises(ValidationError, match="must include a non-empty rewritten_answer"):
        _behavioral_feedback(rewritten_answer=None)


def test_technical_feedback_requires_reference_answer_not_rewritten_answer() -> None:
    feedback = LLMFeedback.model_validate(
        {
            "rubric": TechnicalRubric(correctness=8, depth=7, tradeoffs=6, communication=8),
            "clarity": 8,
            "on_topic": True,
            "strengths": ["Correct approach."],
            "improvements": ["Discuss tradeoffs more."],
            "rambling_notes": "",
            "reference_answer": "A fresh example answer.",
            "follow_up_question": "How would you scale this further?",
        }
    )
    assert feedback.reference_answer
    assert feedback.rewritten_answer is None


def test_technical_feedback_rejects_a_rewritten_answer() -> None:
    with pytest.raises(ValidationError, match="must not include rewritten_answer"):
        LLMFeedback.model_validate(
            {
                "rubric": TechnicalRubric(correctness=8, depth=7, tradeoffs=6, communication=8),
                "clarity": 8,
                "on_topic": True,
                "strengths": ["a"],
                "improvements": ["b"],
                "rambling_notes": "",
                "reference_answer": "A fresh example answer.",
                "rewritten_answer": "Should not be here.",
                "follow_up_question": "?",
            }
        )


def test_situational_feedback_uses_the_same_reference_answer_rule_as_technical() -> None:
    feedback = LLMFeedback.model_validate(
        {
            "rubric": SituationalRubric(
                problem_framing=7, prioritization=8, judgment=7, communication=8
            ),
            "clarity": 8,
            "on_topic": True,
            "strengths": ["Identified the core tension well."],
            "improvements": ["Consider stakeholder impact."],
            "rambling_notes": "",
            "reference_answer": "A strong example approach.",
            "follow_up_question": "What would you do if that didn't work?",
        }
    )
    assert feedback.reference_answer
    assert feedback.rewritten_answer is None


def test_rubric_rejects_a_score_outside_zero_to_ten() -> None:
    with pytest.raises(ValidationError):
        BehavioralRubric(situation=11, task=5, action=5, result=5)


def test_strengths_must_have_at_least_one_item() -> None:
    with pytest.raises(ValidationError):
        _behavioral_feedback(strengths=[])


def test_strengths_cannot_exceed_three_items() -> None:
    with pytest.raises(ValidationError):
        _behavioral_feedback(strengths=["a", "b", "c", "d"])


def test_evidence_cannot_exceed_five_items() -> None:
    with pytest.raises(ValidationError):
        _behavioral_feedback(evidence=[f"quote {i}" for i in range(6)])


def test_compute_overall_score_averages_behavioral_components() -> None:
    rubric = BehavioralRubric(situation=6, task=8, action=10, result=8)
    assert compute_overall_score(rubric) == 8.0


def test_compute_overall_score_averages_technical_components() -> None:
    rubric = TechnicalRubric(correctness=10, depth=6, tradeoffs=6, communication=10)
    assert compute_overall_score(rubric) == 8.0


def test_rubric_overall_score_ignores_the_category_discriminator() -> None:
    assert rubric_overall_score({"category": "technical", "correctness": 8, "depth": 6}) == 7.0


def test_rubric_overall_score_returns_none_for_empty_or_missing_rubric() -> None:
    assert rubric_overall_score(None) is None
    assert rubric_overall_score({}) is None
