import pytest

from app.models.enums import Category, Difficulty, Focus, InterviewerStyle
from app.services.adaptive_engine import (
    MasteryStat,
    PlanItem,
    SelectionMode,
    SessionTurn,
    base_level,
    decide_next,
    next_level_after,
)
from app.services.interviewer_policy import policy_for

PLAN = [
    PlanItem("sql", 0.3),
    PlanItem("caching", 0.2),
    PlanItem("api-design", 0.2),
    PlanItem("communication", 0.2),
    PlanItem("teamwork", 0.1),
]


def _turn(
    competency: str,
    level: int,
    score: float | None,
    mode: str = "coverage",
    category: Category = Category.TECHNICAL,
) -> SessionTurn:
    return SessionTurn(
        competency=competency, level=level, category=category, mode=mode, score=score
    )


def _decide(
    history: list[SessionTurn],
    *,
    style: InterviewerStyle = InterviewerStyle.REALISTIC,
    mastery: dict[str, MasteryStat] | None = None,
    focus: Focus = Focus.MIXED,
    plan: list[PlanItem] | None = None,
) -> tuple[str, int, SelectionMode]:
    decision = decide_next(
        plan=plan or PLAN,
        mastery=mastery or {},
        history=history,
        policy=policy_for(style),
        focus=focus,
        difficulty=Difficulty.MEDIUM,
    )
    return decision.competency, decision.level, decision.mode


def test_first_question_is_the_heaviest_plan_item_and_deterministic() -> None:
    assert _decide([]) == _decide([])
    competency, level, mode = _decide([])
    assert competency == "sql"
    assert level == 3
    assert mode == SelectionMode.COVERAGE


def test_strong_answer_deepens_the_same_competency_one_level_harder() -> None:
    assert _decide([_turn("sql", 3, 9.0)]) == ("sql", 4, SelectionMode.DEEPEN)


def test_weak_answer_steps_back_to_a_diagnostic_on_the_same_competency() -> None:
    assert _decide([_turn("sql", 3, 3.0)]) == ("sql", 2, SelectionMode.DIAGNOSTIC)


def test_a_weak_answer_at_the_easiest_level_moves_on_instead_of_repeating() -> None:
    competency, _, mode = _decide([_turn("sql", 1, 2.0)])
    assert competency != "sql"
    assert mode == SelectionMode.COVERAGE


def test_difficulty_is_bounded_at_the_ceiling() -> None:
    assert next_level_after(5, 10.0, policy_for(InterviewerStyle.CHALLENGING)) == 5
    competency, _, mode = _decide([_turn("sql", 5, 10.0)])
    assert (competency, mode) != ("sql", SelectionMode.DEEPEN)


def test_difficulty_is_bounded_at_the_floor() -> None:
    assert next_level_after(1, 0.0, policy_for(InterviewerStyle.SUPPORTIVE)) == 1


def test_depth_probes_are_budgeted_per_competency() -> None:
    history = [
        _turn("sql", 3, 9.0),
        _turn("sql", 4, 9.0, mode="deepen"),
    ]
    # Realistic allows two probes; a second strong answer should still go deeper...
    assert _decide(history[:2])[2] == SelectionMode.DEEPEN
    # ...but once the budget is spent the engine moves on to a different competency.
    spent = [*history, _turn("sql", 5, 9.0, mode="deepen")]
    competency, _, mode = _decide(spent)
    assert competency != "sql"
    assert mode == SelectionMode.COVERAGE


def test_covered_competencies_are_not_repeated_by_chance() -> None:
    history = [_turn("sql", 3, 6.5)]  # middling: no follow-up for a realistic interviewer
    competency, _, mode = _decide(history)
    assert competency != "sql"
    assert mode == SelectionMode.COVERAGE


def test_styles_produce_genuinely_different_decisions() -> None:
    supportive = _decide([], style=InterviewerStyle.SUPPORTIVE)
    challenging = _decide([], style=InterviewerStyle.CHALLENGING)
    assert challenging[1] > supportive[1]

    after_strong = [_turn("sql", 3, 9.0)]
    assert _decide(after_strong, style=InterviewerStyle.CHALLENGING)[1] == 5
    assert _decide(after_strong, style=InterviewerStyle.SUPPORTIVE)[1] == 4

    middling = [_turn("sql", 3, 6.5)]
    assert _decide(middling, style=InterviewerStyle.CHALLENGING)[2] == SelectionMode.DEEPEN
    assert _decide(middling, style=InterviewerStyle.REALISTIC)[2] == SelectionMode.COVERAGE


def test_a_challenging_interviewer_holds_difficulty_after_a_weak_answer() -> None:
    assert _decide([_turn("sql", 4, 3.0)], style=InterviewerStyle.CHALLENGING) == (
        "sql",
        4,
        SelectionMode.DIAGNOSTIC,
    )


def test_known_weak_skills_are_prioritised_over_known_strong_ones() -> None:
    plan = [PlanItem("sql", 0.5), PlanItem("caching", 0.5)]
    mastery = {
        "sql": MasteryStat(mastery=0.95, confidence=0.9, attempts=8),
        "caching": MasteryStat(mastery=0.2, confidence=0.9, attempts=8),
    }
    assert _decide([], mastery=mastery, plan=plan)[0] == "caching"


def test_two_candidates_with_different_histories_get_different_questions() -> None:
    plan = [PlanItem("sql", 0.5), PlanItem("caching", 0.5)]
    strong_at_sql = {"sql": MasteryStat(0.95, 0.9, 8), "caching": MasteryStat(0.4, 0.9, 8)}
    strong_at_caching = {"sql": MasteryStat(0.4, 0.9, 8), "caching": MasteryStat(0.95, 0.9, 8)}
    assert _decide([], mastery=strong_at_sql, plan=plan)[0] == "caching"
    assert _decide([], mastery=strong_at_caching, plan=plan)[0] == "sql"


def test_known_mastery_shifts_the_starting_level() -> None:
    plan = [PlanItem("sql", 1.0)]
    strong = {"sql": MasteryStat(0.95, 0.9, 8)}
    weak = {"sql": MasteryStat(0.1, 0.9, 8)}
    assert _decide([], mastery=strong, plan=plan)[1] > _decide([], mastery=weak, plan=plan)[1]


def test_resume_gaps_raise_a_competencys_priority() -> None:
    plan = [PlanItem("sql", 0.5, resume_evidence="strong"), PlanItem("caching", 0.5)]
    gap_plan = [
        PlanItem("sql", 0.5, resume_evidence="strong"),
        PlanItem("caching", 0.5, resume_evidence="missing"),
    ]
    assert _decide([], plan=plan)[0] == "sql"  # alphabetical tie-break when equal
    assert _decide([], plan=gap_plan)[0] == "caching"


def test_a_focused_session_only_asks_the_chosen_category() -> None:
    competency, _, _ = _decide([], focus=Focus.BEHAVIORAL)
    assert competency in {"communication", "teamwork"}


def test_mixed_focus_alternates_categories_when_weights_are_close() -> None:
    plan = [PlanItem("sql", 0.5), PlanItem("communication", 0.5)]
    first = _decide([], plan=plan)
    second = _decide([_turn(first[0], first[1], 6.5, category=Category.TECHNICAL)], plan=plan)
    assert first[0] != second[0]


def test_base_level_reflects_difficulty_and_style() -> None:
    assert base_level(Difficulty.EASY, policy_for(InterviewerStyle.SUPPORTIVE)) == 1
    assert base_level(Difficulty.HARD, policy_for(InterviewerStyle.CHALLENGING)) == 5
    assert base_level(Difficulty.MEDIUM, policy_for(None)) == 3


@pytest.mark.parametrize("style", list(InterviewerStyle))
def test_every_style_has_a_policy_with_sane_bounds(style: InterviewerStyle) -> None:
    policy = policy_for(style)
    assert policy.weak_threshold < policy.strong_threshold
    assert policy.max_depth_probes >= 1
    assert policy.tone_instruction
