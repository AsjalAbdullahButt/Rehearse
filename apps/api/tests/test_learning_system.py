"""Phase 2: re-answer comparison, spaced repetition, and the readiness score."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Category, Difficulty, Role
from app.models.question import Question
from app.schemas.feedback import LLMFeedback, TechnicalRubric
from app.schemas.transcription import TranscriptionResult
from app.services import llm, readiness, repo, spaced_repetition, stt
from app.services.adaptive_engine import PlanItem
from app.services.comparison import AttemptData, compare_attempts
from app.services.spaced_repetition import SkillState
from tests.test_answers_router import (
    _auth_headers,
    _create_session,
    _fake_transcription,
    _post_answer,
)

# ─── comparison (pure) ───────────────────────────────────────────────────


def _attempt(n: int, **rubric: int) -> AttemptData:
    base = {
        "category": "technical",
        "correctness": 5,
        "depth": 5,
        "tradeoffs": 5,
        "communication": 5,
    }
    base.update(rubric)
    return AttemptData(
        answer_id=f"a{n}",
        attempt_number=n,
        transcript=f"attempt {n}",
        created_at=datetime(2026, 1, n, tzinfo=UTC),
        rubric=base,  # type: ignore[arg-type]
        clarity=5,
        wpm=120.0 + n,
        filler_count=4 if n == 1 else 1,
        word_count=100,
        improvements=["Quantify the impact."],
    )


def test_comparison_reports_what_improved_what_stayed_weak_and_what_to_focus_on() -> None:
    result = compare_attempts(
        [_attempt(2, tradeoffs=8, depth=5, correctness=9, communication=5), _attempt(1)]
    )

    assert [a.attempt_number for a in result.attempts] == [1, 2]
    assert result.improved == ["correctness", "tradeoffs"]
    assert set(result.remained_weak) == {"communication", "depth"}
    assert result.focus_next == "communication"
    assert result.overall_delta == pytest.approx(1.75)
    assert result.filler_rate_delta == pytest.approx(-3.0)
    assert any("Quantify the impact" in line for line in result.summary)


def test_comparison_flags_regressions() -> None:
    result = compare_attempts([_attempt(1), _attempt(2, depth=2)])
    assert result.regressed == ["depth"]


def test_a_single_attempt_has_no_deltas_but_still_gives_focus_advice() -> None:
    result = compare_attempts([_attempt(1, depth=3)])
    assert result.overall_delta is None
    assert result.components == []
    assert result.focus_next == "depth"


# ─── spaced repetition (pure) ────────────────────────────────────────────

NOW = datetime(2026, 10, 10, 12, 0)


def _skill(key: str, mastery: float, days_ago: float, attempts: int = 4, ok: int = 3) -> SkillState:
    return SkillState(key, mastery, attempts, ok, NOW - timedelta(days=days_ago))


def test_weaker_skills_come_back_sooner() -> None:
    assert spaced_repetition.interval_days(0.2, 4, 3) < spaced_repetition.interval_days(0.7, 4, 3)
    assert spaced_repetition.interval_days(0.95, 4, 4) == spaced_repetition.MASTERED_INTERVAL_DAYS


def test_repeated_failures_shorten_the_interval() -> None:
    assert spaced_repetition.interval_days(0.7, 4, 1) < spaced_repetition.interval_days(0.7, 4, 4)
    assert spaced_repetition.interval_days(0.1, 4, 0) == 1


def test_mastered_skills_are_not_dropped_but_not_due_yet() -> None:
    plan = spaced_repetition.build_plan([_skill("sql", 0.95, days_ago=3, ok=4)], NOW)
    assert plan.today == []
    assert [s.competency for s in plan.upcoming] == ["sql"]
    assert plan.question_count == 0


def test_the_same_mastered_skill_returns_after_two_weeks() -> None:
    plan = spaced_repetition.build_plan([_skill("sql", 0.95, days_ago=15, ok=4)], NOW)
    assert [s.competency for s in plan.today] == ["sql"]


def test_today_is_capped_and_ordered_most_overdue_first() -> None:
    skills = [
        _skill("a", 0.3, days_ago=10),
        _skill("b", 0.3, days_ago=2),
        _skill("c", 0.5, days_ago=9),
        _skill("d", 0.3, days_ago=8),
    ]
    plan = spaced_repetition.build_plan(skills, NOW)
    assert [s.competency for s in plan.today] == ["a", "d", "c"]
    assert "b" in [s.competency for s in plan.upcoming]
    assert plan.question_count == 3
    assert plan.estimated_minutes == 9


def test_unpracticed_skills_are_not_scheduled() -> None:
    assert spaced_repetition.build_plan([SkillState("x", 0.0, 0, 0, None)], NOW).today == []


# ─── readiness (pure) ────────────────────────────────────────────────────

PLAN = [PlanItem("sql", 0.5), PlanItem("caching", 0.3), PlanItem("communication", 0.2)]


def test_no_score_without_enough_evidence() -> None:
    out = readiness.compute_readiness(
        PLAN, {"sql": readiness.Evidence(0.9, 0.3, 1)}, role="backend"
    )
    assert out.score is None
    assert out.main_risk is None
    assert "Not enough practice" in out.explanation[0]


def test_low_confidence_is_shrunk_toward_neutral() -> None:
    thin = readiness.compute_readiness(
        PLAN,
        {"sql": readiness.Evidence(1.0, 0.3, 3), "caching": readiness.Evidence(1.0, 0.3, 3)},
        role="backend",
    )
    solid = readiness.compute_readiness(
        PLAN,
        {"sql": readiness.Evidence(1.0, 0.95, 12), "caching": readiness.Evidence(1.0, 0.95, 12)},
        role="backend",
    )
    assert thin.score is not None and solid.score is not None
    assert thin.score < solid.score <= 100


def test_readiness_is_explainable_and_surfaces_strongest_and_biggest_risk() -> None:
    out = readiness.compute_readiness(
        PLAN,
        {
            "sql": readiness.Evidence(0.9, 0.9, 6),
            "caching": readiness.Evidence(0.3, 0.9, 6),
        },
        role="backend",
    )
    assert out.score is not None
    assert out.strongest == "sql"
    assert out.main_risk == "caching"
    assert out.coverage == 80
    assert {d.competency for d in out.drivers} == {"sql", "caching", "communication"}
    assert next(d for d in out.drivers if d.competency == "communication").assessed is False
    assert any("Biggest gap" in line for line in out.explanation)
    assert {c.category.value for c in out.categories} == {"technical"}


# ─── API: retries ────────────────────────────────────────────────────────


def _feedback(score: int, follow_up: str = "Why that approach?") -> LLMFeedback:
    return LLMFeedback(
        rubric=TechnicalRubric(
            correctness=score, depth=score, tradeoffs=score, communication=score
        ),
        clarity=score,
        on_topic=True,
        strengths=["Clear."],
        improvements=["Go deeper."],
        evidence=[],
        rambling_notes="",
        reference_answer="A reference answer.",
        follow_up_question=follow_up,
    )


@pytest.fixture
def grader(monkeypatch: pytest.MonkeyPatch) -> dict[str, int]:
    state = {"score": 5}

    async def fake_transcribe(
        audio_bytes: bytes, filename: str, language: str | None = None
    ) -> TranscriptionResult:
        return _fake_transcription()

    async def fake_feedback(**kwargs: Any) -> LLMFeedback:
        return _feedback(state["score"])

    monkeypatch.setattr(stt, "transcribe", fake_transcribe)
    monkeypatch.setattr(llm, "generate_feedback", fake_feedback)
    return state


async def _seed(db: AsyncSession) -> None:
    db.add(
        Question(
            role=Role.BACKEND,
            difficulty=Difficulty.MEDIUM,
            category=Category.TECHNICAL,
            text="Explain what a database index is.",
            competency="sql",
            level=3,
        )
    )
    await db.commit()


def _retry(
    client: TestClient, user: dict[str, Any], session: dict[str, Any], answer_id: str
) -> Any:
    headers = _auth_headers(user)
    return client.post(
        "/v1/answers",
        data={
            "session_id": session["id"],
            "session_question_id": session["current_question"]["id"],
            "retry_of_answer_id": answer_id,
        },
        files={"audio": ("a.webm", b"\x1a\x45\xdf\xa3audio", "audio/webm")},
        headers=headers,
    )


async def test_retry_keeps_the_original_and_does_not_advance_or_double_count(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    grader: dict[str, int],
) -> None:
    user = register_user()
    await _seed(db_session)
    session = _create_session(client, user, focus="technical")
    first = _post_answer(
        client,
        session_id=session["id"],
        session_question_id=session["current_question"]["id"],
        user=user,
    ).json()
    mastery_before = client.get("/v1/mastery", headers=_auth_headers(user)).json()

    grader["score"] = 9
    response = _retry(client, user, session, first["id"])

    assert response.status_code == 201, response.text
    retry = response.json()
    assert retry["attempt_number"] == 2
    assert retry["original_answer_id"] == first["id"]
    assert retry["next_question"] is None
    assert retry["feedback"]["rubric"]["correctness"] == 9

    original = client.get(f"/v1/answers/{first['id']}", headers=_auth_headers(user)).json()
    assert original["feedback"]["rubric"]["correctness"] == 5  # untouched

    assert client.get("/v1/mastery", headers=_auth_headers(user)).json() == mastery_before
    summary = client.get(f"/v1/sessions/{session['id']}", headers=_auth_headers(user)).json()
    assert summary["questions_completed"] == 1
    assert summary["session"]["current_question_number"] == 2  # only the original advanced it

    comparison = client.get(
        f"/v1/answers/{retry['id']}/attempts", headers=_auth_headers(user)
    ).json()
    assert [a["attempt_number"] for a in comparison["attempts"]] == [1, 2]
    assert comparison["overall_delta"] == 4.0
    assert "correctness" in comparison["improved"]
    assert comparison["remained_weak"] == []


async def test_a_question_can_only_be_retried_a_limited_number_of_times(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    grader: dict[str, int],
) -> None:
    user = register_user()
    await _seed(db_session)
    session = _create_session(client, user, focus="technical")
    first = _post_answer(
        client,
        session_id=session["id"],
        session_question_id=session["current_question"]["id"],
        user=user,
    ).json()

    statuses = [_retry(client, user, session, first["id"]).status_code for _ in range(5)]

    assert statuses == [201, 201, 201, 201, 409]


async def test_a_retry_cannot_target_another_users_answer(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    grader: dict[str, int],
) -> None:
    owner = register_user("owner@example.com")
    intruder = register_user("intruder@example.com")
    await _seed(db_session)
    owner_session = _create_session(client, owner, focus="technical")
    owner_answer = _post_answer(
        client,
        session_id=owner_session["id"],
        session_question_id=owner_session["current_question"]["id"],
        user=owner,
    ).json()
    intruder_session = _create_session(client, intruder, focus="technical")

    response = _retry(client, intruder, intruder_session, owner_answer["id"])

    assert response.status_code == 404
    comparison = client.get(
        f"/v1/answers/{owner_answer['id']}/attempts", headers=_auth_headers(intruder)
    )
    assert comparison.status_code == 404


async def test_a_retry_must_name_an_answer_to_the_same_question(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    grader: dict[str, int],
) -> None:
    user = register_user()
    await _seed(db_session)
    session_a = _create_session(client, user, focus="technical")
    session_b = _create_session(client, user, focus="technical")
    answer_a = _post_answer(
        client,
        session_id=session_a["id"],
        session_question_id=session_a["current_question"]["id"],
        user=user,
    ).json()

    assert _retry(client, user, session_b, answer_a["id"]).status_code == 404


# ─── API: practice plan & readiness ──────────────────────────────────────


async def test_practice_plan_and_readiness_reflect_recorded_practice(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    grader: dict[str, int],
) -> None:
    user = register_user()
    await _seed(db_session)
    grader["score"] = 3
    for _ in range(3):
        session = _create_session(client, user, focus="technical")
        _post_answer(
            client,
            session_id=session["id"],
            session_question_id=session["current_question"]["id"],
            user=user,
        )

    # Make the practice old enough to be due.
    rows = await repo.list_candidate_competencies(db_session, user_id=user["user"]["id"])
    for row in rows:
        row.last_practiced_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=5)
        db_session.add(row)
    await db_session.commit()

    plan = client.get("/v1/practice-plan?role=backend", headers=_auth_headers(user)).json()
    assert [s["competency"] for s in plan["today"]] == ["sql"]
    assert plan["focus_topics"] == ["sql"]
    assert plan["question_count"] == 3
    assert plan["estimated_minutes"] == 9

    ready = client.get("/v1/readiness?role=backend", headers=_auth_headers(user)).json()
    assert ready["total_attempts"] >= 3
    assert ready["coverage"] > 0
    assert any(d["competency"] == "sql" and d["assessed"] for d in ready["drivers"])


async def test_readiness_has_no_score_for_a_new_user(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()
    ready = client.get("/v1/readiness?role=backend", headers=_auth_headers(user)).json()
    assert ready["score"] is None
    assert ready["explanation"]


async def test_readiness_and_plan_only_see_the_callers_data(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    grader: dict[str, int],
) -> None:
    alice = register_user("alice@example.com")
    bob = register_user("bob@example.com")
    await _seed(db_session)
    session = _create_session(client, alice, focus="technical")
    _post_answer(
        client,
        session_id=session["id"],
        session_question_id=session["current_question"]["id"],
        user=alice,
    )

    assert (
        client.get("/v1/readiness?role=backend", headers=_auth_headers(bob)).json()[
            "total_attempts"
        ]
        == 0
    )
    assert client.get("/v1/practice-plan", headers=_auth_headers(bob)).json()["upcoming"] == []


def test_new_endpoints_require_authentication(client: TestClient) -> None:
    assert client.get("/v1/readiness?role=backend").status_code == 401
    assert client.get("/v1/practice-plan").status_code == 401
    assert client.get("/v1/answers/x/attempts").status_code == 401
