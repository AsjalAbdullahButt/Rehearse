from app.models.enums import Category
from app.services.competency import (
    confidence_for,
    evidence_score,
    infer_competency,
    normalize_competency,
    update_mastery,
)


def test_normalize_maps_variants_onto_one_canonical_key() -> None:
    assert {
        normalize_competency(name)
        for name in ("API Security", "api security", "REST security", "Web API security")
    } == {"security"}
    assert normalize_competency("PostgreSQL") == "sql"
    assert normalize_competency("SQL & Databases") == "sql"


def test_normalize_keeps_unknown_skills_under_a_stable_slug() -> None:
    assert normalize_competency("Prompt Engineering") == "prompt-engineering"
    assert normalize_competency("  Prompt   Engineering ") == "prompt-engineering"


def test_normalize_never_returns_an_empty_key() -> None:
    assert normalize_competency("!!!") == "general"


def test_infer_competency_uses_category_and_keywords() -> None:
    assert (
        infer_competency("How would you invalidate a stale cache entry?", Category.TECHNICAL)
        == "caching"
    )
    assert infer_competency("Tell me about a conflict with a teammate", Category.BEHAVIORAL) == (
        "conflict"
    )
    assert infer_competency("Completely unrelated sentence", Category.TECHNICAL) is None


def test_evidence_rewards_difficulty() -> None:
    assert evidence_score(8, level=5) > evidence_score(8, level=1)
    assert evidence_score(10, level=5) <= 1.0
    assert evidence_score(0, level=5) == 0.0


def test_first_answer_sets_mastery_directly_then_averages() -> None:
    mastery, confidence = update_mastery(0.0, 0, 0.8)
    assert mastery == 0.8
    assert 0 < confidence < 1

    mastery, _ = update_mastery(mastery, 1, 0.4)
    assert mastery == 0.6  # running average of the first two attempts


def test_one_outlier_does_not_overreact_once_there_is_history() -> None:
    mastery = 0.8
    for attempt in range(5):
        mastery, _ = update_mastery(mastery, 5 + attempt, 0.8)
    after_bad_answer, _ = update_mastery(mastery, 10, 0.0)
    assert after_bad_answer > 0.5


def test_confidence_grows_monotonically_with_evidence() -> None:
    values = [confidence_for(n) for n in range(0, 8)]
    assert values[0] == 0.0
    assert values == sorted(values)
    assert values[-1] < 1.0
