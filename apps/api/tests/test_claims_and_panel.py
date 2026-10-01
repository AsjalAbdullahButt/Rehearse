"""Phase 3: claim probing, resume consistency, and panel interviews."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.enums import Category, Difficulty, Focus, InterviewerStyle, Role
from app.models.question import Question
from app.schemas.feedback import (
    ConsistencyNote,
    ExtractedClaim,
    LLMFeedback,
    TechnicalRubric,
)
from app.schemas.planning import AnalyzedCompetency, JobAnalysis, ResumeClaim
from app.schemas.transcription import TranscriptionResult
from app.services import claims, llm, panel, stt
from app.services.adaptive_engine import (
    PlanItem,
    SelectionMode,
    SessionTurn,
    decide_next,
)
from app.services.claims import ClaimView
from app.services.interviewer_policy import policy_for
from tests.test_answers_router import _auth_headers, _fake_transcription, _post_answer

# ─── claims (pure) ───────────────────────────────────────────────────────


def _extracted(quote: str = "token bucket rate limiter", **overrides: Any) -> ExtractedClaim:
    base: dict[str, Any] = {
        "claim": "Built a rate limiter",
        "type": "technical",
        "importance": "high",
        "metric": None,
        "quote": quote,
    }
    base.update(overrides)
    return ExtractedClaim(**base)


def test_claims_whose_quote_is_not_in_the_transcript_are_dropped() -> None:
    kept = claims.verified_claims(
        [_extracted(), _extracted("we migrated everything to Rust")],
        transcript="I designed a Token Bucket rate limiter, honestly.",
    )
    assert [c.quote for c in kept] == ["token bucket rate limiter"]


def test_consistency_notes_need_both_quotes_to_be_real() -> None:
    note = ConsistencyNote(
        kind="duration",
        answer_statement="only used Python for six months",
        resume_statement="Python - 3 years",
    )
    transcript = "Honestly I have only used Python for six months."
    resume = "Skills: Python - 3 years, SQL"

    shown = claims.verified_consistency([note], transcript=transcript, resume_text=resume)
    assert len(shown) == 1
    assert "recruiter" in shown[0].message.lower()
    assert "lie" not in shown[0].message.lower()

    assert claims.verified_consistency([note], transcript=transcript, resume_text="Go only") == []
    assert claims.verified_consistency([note], transcript="unrelated", resume_text=resume) == []
    assert claims.verified_consistency([note], transcript=transcript, resume_text=None) == []


def _view(**overrides: Any) -> ClaimView:
    base: dict[str, Any] = {
        "id": "c1",
        "text": "Cut latency by 40%",
        "type": "performance",
        "importance": "high",
        "metric": "40%",
        "competency": "performance",
        "chain_depth": 0,
        "probe_count": 0,
        "answer_id": "a1",
        "source": "answer",
    }
    base.update(overrides)
    return ClaimView(**base)


def _choose(
    items: list[ClaimView],
    style: InterviewerStyle = InterviewerStyle.REALISTIC,
    *,
    probes_used: int = 0,
    question_count: int = 5,
    last_answer_id: str | None = "a1",
    asked: int = 2,
) -> ClaimView | None:
    return claims.choose_claim(
        items,
        policy=policy_for(style),
        probes_used=probes_used,
        question_count=question_count,
        last_answer_id=last_answer_id,
        questions_asked=asked,
    )


def test_a_high_importance_claim_is_probed_once() -> None:
    assert _choose([_view()]) is not None
    assert _choose([_view(probe_count=1)]) is None


def test_the_interviewer_style_sets_how_important_a_claim_must_be() -> None:
    medium = _view(importance="medium")
    low = _view(importance="low")
    assert _choose([medium], InterviewerStyle.SUPPORTIVE) is None
    assert _choose([medium], InterviewerStyle.REALISTIC) is not None
    assert _choose([low], InterviewerStyle.REALISTIC) is None
    assert _choose([low], InterviewerStyle.CHALLENGING) is not None


def test_probe_chains_are_cut_off_at_the_styles_depth_budget() -> None:
    deep = _view(chain_depth=3)
    assert _choose([deep], InterviewerStyle.REALISTIC) is None
    assert _choose([deep], InterviewerStyle.CHALLENGING) is not None


def test_claim_probes_never_take_over_the_whole_interview() -> None:
    assert _choose([_view()], question_count=5, probes_used=2) is None
    assert _choose([_view()], question_count=5, probes_used=1) is not None


def test_claims_from_the_latest_answer_are_probed_first_then_by_importance() -> None:
    old_high = _view(id="old", answer_id="a0", importance="high")
    new_medium = _view(id="new", answer_id="a1", importance="medium")
    assert _choose([old_high, new_medium]) is new_medium
    assert _choose([old_high, new_medium], last_answer_id="a9") is old_high


def test_resume_claims_wait_until_the_interview_is_under_way() -> None:
    resume = _view(source="resume", answer_id=None)
    assert _choose([resume], asked=0) is None
    assert _choose([resume], asked=1) is resume


def test_support_status_only_ever_rises_on_strong_answers_and_is_never_contradictory() -> None:
    assert claims.status_after_probe(0, 8.0) == ("partially_supported", 1)
    assert claims.status_after_probe(1, 8.0) == ("well_supported", 2)
    assert claims.status_after_probe(0, 5.5) == ("partially_supported", 0)
    assert claims.status_after_probe(0, 2.0) == ("unverified", 0)
    assert claims.status_after_probe(1, 1.0)[0] != "contradictory"


@pytest.mark.parametrize(
    ("type_", "expected"),
    [
        ("performance", "measure"),
        ("ownership", "personal contribution"),
        ("technical", "implemented"),
        ("resume", "Your resume says"),
    ],
)
def test_fallback_probe_questions_quote_the_claim_and_stay_neutral(
    type_: str, expected: str
) -> None:
    text = claims.probe_fallback_text(_view(type=type_))
    assert "Cut latency by 40%" in text
    assert expected in text
    assert "really" not in text.lower() and "exaggerat" not in text.lower()


def test_an_unknown_claim_type_still_gets_a_probe() -> None:
    assert "Cut latency by 40%" in claims.probe_fallback_text(_view(type="mystery"))


# ─── engine integration (pure) ───────────────────────────────────────────

PLAN = [PlanItem("sql", 0.4), PlanItem("communication", 0.3), PlanItem("ownership", 0.3)]


def test_a_claim_takes_precedence_and_keeps_the_claims_competency() -> None:
    history = [
        SessionTurn("sql", 3, Category.TECHNICAL, "coverage", 9.0, None),
    ]
    decision = decide_next(
        plan=PLAN,
        mastery={},
        history=history,
        policy=policy_for(InterviewerStyle.REALISTIC),
        focus=Focus.MIXED,
        difficulty=Difficulty.MEDIUM,
        claim=_view(competency="sql"),
    )
    assert decision.mode == SelectionMode.CLAIM_PROBE
    assert decision.claim_id == "c1"
    assert decision.competency == "sql"


def test_allowed_competencies_limit_a_fresh_choice_to_one_remit() -> None:
    decision = decide_next(
        plan=PLAN,
        mastery={},
        history=[],
        policy=policy_for(None),
        focus=Focus.MIXED,
        difficulty=Difficulty.MEDIUM,
        allowed=frozenset({"communication"}),
    )
    assert decision.competency == "communication"


# ─── panel (pure) ────────────────────────────────────────────────────────


def test_each_panelist_owns_different_competencies() -> None:
    assert panel.owner_of("communication") == panel.RECRUITER
    assert panel.owner_of("caching") == panel.TECH_LEAD
    assert panel.owner_of("ownership") == panel.MANAGER
    assert panel.owner_of("some-custom-skill") == panel.TECH_LEAD


def test_panelists_take_turns_but_only_within_their_remit() -> None:
    competencies = ["communication", "sql", "ownership"]
    order = [panel.choose_panelist(i, competencies)[0].key for i in range(6)]
    assert order == ["recruiter", "tech_lead", "manager"] * 2
    for index in range(3):
        panelist, allowed = panel.choose_panelist(index, competencies)
        assert all(panel.owner_of(c) == panelist for c in allowed)


def test_a_panelist_with_nothing_to_ask_is_skipped() -> None:
    only_technical = ["sql", "caching"]
    for turn in range(4):
        panelist, allowed = panel.choose_panelist(turn, only_technical)
        assert panelist == panel.TECH_LEAD
        assert allowed == frozenset(only_technical)


def test_claim_types_are_routed_to_the_right_panelist() -> None:
    assert claims.panelist_for_claim("performance") == "tech_lead"
    assert claims.panelist_for_claim("leadership") == "manager"
    assert claims.panelist_for_claim("resume") == "recruiter"


# ─── API ─────────────────────────────────────────────────────────────────


def _feedback(
    score: int = 6,
    *,
    claim_list: list[ExtractedClaim] | None = None,
    consistency: list[ConsistencyNote] | None = None,
) -> LLMFeedback:
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
        follow_up_question="Anything else?",
        claims=claim_list or [],
        consistency=consistency or [],
    )


@pytest.fixture
def scripted(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Lets a test script the transcript and the grader's output for each successive answer."""
    state: dict[str, Any] = {"transcripts": [], "feedbacks": []}

    async def fake_transcribe(
        audio_bytes: bytes, filename: str, language: str | None = None
    ) -> TranscriptionResult:
        text = state["transcripts"].pop(0) if state["transcripts"] else None
        return _fake_transcription(text) if text else _fake_transcription()

    async def fake_feedback(**kwargs: Any) -> LLMFeedback:
        return state["feedbacks"].pop(0) if state["feedbacks"] else _feedback()

    monkeypatch.setattr(stt, "transcribe", fake_transcribe)
    monkeypatch.setattr(llm, "generate_feedback", fake_feedback)
    return state


async def _seed_bank(db: AsyncSession, n: int = 6) -> None:
    for i in range(n):
        db.add(
            Question(
                role=Role.BACKEND,
                difficulty=Difficulty.MEDIUM,
                category=Category.TECHNICAL,
                text=f"Bank question number {i} about databases.",
                competency="sql",
                level=3,
            )
        )
    await db.commit()


def _create(client: TestClient, user: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "role": "backend",
        "difficulty": "medium",
        "experience_level": "mid",
        "focus": "technical",
        "question_count": 5,
        "answer_cap_s": 120,
        "interviewer_style": "realistic",
    }
    payload.update(overrides)
    response = client.post("/v1/sessions", json=payload, headers=_auth_headers(user))
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def _answer(client: TestClient, user: dict[str, Any], session: dict[str, Any]) -> dict[str, Any]:
    question = session.get("current_question", session)
    response = _post_answer(
        client, session_id=session["id"], session_question_id=question["id"], user=user
    )
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


async def test_a_claim_in_an_answer_becomes_the_next_probe(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    scripted: dict[str, Any],
) -> None:
    user = register_user()
    await _seed_bank(db_session)
    session = _create(client, user)
    scripted["transcripts"] = ["I cut API latency by around 40 percent with Redis caching."]
    scripted["feedbacks"] = [
        _feedback(
            claim_list=[
                _extracted(
                    "cut API latency by around 40 percent",
                    claim="Reduced API latency by 40%",
                    type="performance",
                    metric="40%",
                )
            ]
        )
    ]

    report = _answer(client, user, session)

    assert [c["claim_text"] for c in report["claims"]] == ["Reduced API latency by 40%"]
    assert report["claims"][0]["status"] == "unverified"
    assert "follow-up" in report["claims"][0]["note"]
    probe = report["next_question"]
    assert probe["selection_reason"] == "claim_probe"
    assert "Reduced API latency by 40%" in probe["text"]  # outage fallback template
    assert "measure" in probe["text"]


async def test_a_fabricated_claim_is_never_recorded_or_probed(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    scripted: dict[str, Any],
) -> None:
    user = register_user()
    await _seed_bank(db_session)
    session = _create(client, user)
    scripted["transcripts"] = ["I wrote some tests."]
    scripted["feedbacks"] = [
        _feedback(claim_list=[_extracted("led a team of fifty engineers", claim="Led 50 people")])
    ]

    report = _answer(client, user, session)

    assert report["claims"] == []
    assert report["next_question"]["selection_reason"] != "claim_probe"


async def test_a_gentle_interviewer_ignores_a_medium_claim(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    scripted: dict[str, Any],
) -> None:
    user = register_user()
    await _seed_bank(db_session)
    session = _create(client, user, interviewer_style="supportive")
    scripted["transcripts"] = ["I used a token bucket rate limiter."]
    scripted["feedbacks"] = [_feedback(claim_list=[_extracted(importance="medium")])]

    report = _answer(client, user, session)

    assert len(report["claims"]) == 1  # still recorded for the candidate's own preparation
    assert report["next_question"]["selection_reason"] != "claim_probe"


async def test_answering_a_probe_updates_how_well_supported_the_claim_is(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    scripted: dict[str, Any],
) -> None:
    user = register_user()
    await _seed_bank(db_session)
    session = _create(client, user)
    scripted["transcripts"] = [
        "I built a token bucket rate limiter.",
        "We measured p95 latency before and after with a load test.",
    ]
    scripted["feedbacks"] = [
        _feedback(claim_list=[_extracted()]),
        _feedback(score=9),
    ]
    first = _answer(client, user, session)
    probe = first["next_question"]
    assert probe["selection_reason"] == "claim_probe"

    response = _post_answer(
        client, session_id=session["id"], session_question_id=probe["id"], user=user
    )
    assert response.status_code == 201

    summary = client.get(f"/v1/sessions/{session['id']}", headers=_auth_headers(user)).json()
    assert [c["status"] for c in summary["claims"]] == ["partially_supported"]
    assert summary["claims"][0]["note"] is not None


async def test_a_weak_probe_answer_leaves_the_claim_unverified_not_contradictory(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    scripted: dict[str, Any],
) -> None:
    user = register_user()
    await _seed_bank(db_session)
    session = _create(client, user)
    scripted["transcripts"] = ["I built a token bucket rate limiter.", "Um, I don't remember."]
    scripted["feedbacks"] = [_feedback(claim_list=[_extracted()]), _feedback(score=2)]
    probe = _answer(client, user, session)["next_question"]
    _post_answer(client, session_id=session["id"], session_question_id=probe["id"], user=user)

    summary = client.get(f"/v1/sessions/{session['id']}", headers=_auth_headers(user)).json()

    assert summary["claims"][0]["status"] == "unverified"


async def test_claims_are_private_to_their_owner(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    scripted: dict[str, Any],
) -> None:
    alice = register_user("alice@example.com")
    bob = register_user("bob@example.com")
    await _seed_bank(db_session)
    session = _create(client, alice)
    scripted["transcripts"] = ["I built a token bucket rate limiter."]
    scripted["feedbacks"] = [_feedback(claim_list=[_extracted()])]
    _answer(client, alice, session)

    assert (
        client.get(f"/v1/sessions/{session['id']}", headers=_auth_headers(bob)).status_code == 404
    )


async def test_resume_consistency_notes_are_shown_only_when_both_quotes_are_real(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    scripted: dict[str, Any],
) -> None:
    user = register_user()
    await _seed_bank(db_session)
    session = _create(
        client, user, candidate_background="Backend engineer. Python - 3 years. Built APIs."
    )
    scripted["transcripts"] = ["Honestly I have only used Python for around six months."]
    scripted["feedbacks"] = [
        _feedback(
            consistency=[
                ConsistencyNote(
                    kind="duration",
                    answer_statement="only used Python for around six months",
                    resume_statement="Python - 3 years",
                ),
                ConsistencyNote(
                    kind="other",
                    answer_statement="I worked at Google",
                    resume_statement="Python - 3 years",
                ),
            ]
        )
    ]

    report = _answer(client, user, session)

    notes = report["feedback"]["consistency_notes"]
    assert [n["kind"] for n in notes] == ["duration"]
    assert "recruiter" in notes[0]["message"].lower()


async def test_high_impact_resume_claims_are_seeded_and_probed(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    scripted: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    background = "Led a team of 8 engineers. Reduced infrastructure cost by 30%."

    async def fake_analyze(**kwargs: Any) -> JobAnalysis:
        return JobAnalysis(
            competencies=[AnalyzedCompetency(name="SQL", weight=1)],
            resume_claims=[
                ResumeClaim(
                    claim="Led a team of 8 engineers",
                    type="leadership",
                    importance="high",
                    quote="Led a team of 8 engineers",
                ),
                ResumeClaim(
                    claim="Cut cost by 70%",
                    type="numeric",
                    importance="high",
                    quote="this sentence is not in the resume",
                ),
            ],
        )

    monkeypatch.setattr(llm, "analyze_job_target", fake_analyze)
    user = register_user()
    await _seed_bank(db_session)
    session = _create(client, user, candidate_background=background)

    summary = client.get(f"/v1/sessions/{session['id']}", headers=_auth_headers(user)).json()
    assert [c["claim_text"] for c in summary["claims"]] == ["Led a team of 8 engineers"]
    assert summary["claims"][0]["source"] == "resume"

    # The resume claim waits for the interview to get going, then is probed.
    second = _answer(client, user, session)["next_question"]
    assert second["selection_reason"] == "claim_probe"
    assert "Your resume says" in second["text"] or "Led a team of 8 engineers" in second["text"]


async def test_resume_claims_are_not_probed_for_a_candidate_without_a_resume(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    scripted: dict[str, Any],
) -> None:
    user = register_user()
    await _seed_bank(db_session)
    session = _create(client, user)
    assert (
        client.get(f"/v1/sessions/{session['id']}", headers=_auth_headers(user)).json()["claims"]
        == []
    )


# ─── panel API ───────────────────────────────────────────────────────────


async def test_a_panel_interview_rotates_panelists_with_their_own_remits(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    scripted: dict[str, Any],
) -> None:
    user = register_user()
    await _seed_bank(db_session)
    session = _create(client, user, panel=True, focus="mixed", question_count=8)
    assert session["panel"] is True

    first = session["current_question"]
    assert (first["panelist"], first["panelist_name"], first["panelist_title"]) == (
        "recruiter",
        "Sam",
        "Recruiter",
    )

    asked = [first]
    current = session
    for _ in range(2):
        report = _answer(client, user, current)
        nxt = report["next_question"]
        asked.append(nxt)
        current = {"id": session["id"], "current_question": nxt}

    assert [q["panelist"] for q in asked] == ["recruiter", "tech_lead", "manager"]
    # Each question was chosen from that panelist's remit, not just labelled with their name.
    for question in asked:
        owner = panel.owner_of(question["competency"]).key if question["competency"] else None
        if question["selection_reason"] == "coverage":
            assert owner == question["panelist"]


async def test_the_summary_reports_each_panelists_assessment(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    scripted: dict[str, Any],
) -> None:
    user = register_user()
    await _seed_bank(db_session)
    session = _create(client, user, panel=True, focus="mixed", question_count=8)
    # Middling scores (neither strong nor weak) so each answer moves on to the next panelist
    # instead of triggering a same-panelist deepen/diagnostic follow-up.
    scripted["feedbacks"] = [_feedback(score=7), _feedback(score=6)]
    current: dict[str, Any] = session
    for _ in range(2):
        current = {
            "id": session["id"],
            "current_question": _answer(client, user, current)["next_question"],
        }

    summary = client.get(f"/v1/sessions/{session['id']}", headers=_auth_headers(user)).json()

    by_key = {a["panelist"]: a for a in summary["panel_assessments"]}
    assert by_key["recruiter"]["avg_score"] == 7.0
    assert by_key["tech_lead"]["avg_score"] == 6.0
    assert by_key["recruiter"]["label"] == "Recruiter assessment"
    assert summary["overall_score"] == 6.5


async def test_a_normal_interview_has_no_panel(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    await _seed_bank(db_session)
    session = _create(client, user)
    assert session["panel"] is False
    assert session["current_question"]["panelist"] is None
    summary = client.get(f"/v1/sessions/{session['id']}", headers=_auth_headers(user)).json()
    assert summary["panel_assessments"] == []


async def test_panel_interviews_can_be_switched_off(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = register_user()
    await _seed_bank(db_session)
    settings = get_settings()
    monkeypatch.setattr(settings, "enable_panel_interview", False)

    response = client.post(
        "/v1/sessions",
        json={
            "role": "backend",
            "difficulty": "medium",
            "experience_level": "mid",
            "focus": "mixed",
            "question_count": 5,
            "answer_cap_s": 120,
            "panel": True,
        },
        headers=_auth_headers(user),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "feature_disabled"
    features = client.get("/v1/features", headers=_auth_headers(user)).json()
    assert features == {"panel_interview": False, "camera_coach": False}
