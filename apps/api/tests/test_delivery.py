"""Phase 4: delivery (prosody) coaching and the optional camera coach."""

import json
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.enums import Category, Difficulty, Role
from app.models.question import Question
from app.schemas.delivery import CameraSummary, ProsodySummary
from app.schemas.feedback import LLMFeedback, TechnicalRubric
from app.schemas.transcription import TranscriptionResult, WordTiming
from app.services import delivery, llm, stt
from tests.test_answers_router import _auth_headers, _create_session

# ─── timing features (pure) ──────────────────────────────────────────────


def _words(
    n: int, *, start: float = 0.5, step: float = 0.4, gap_every: int = 0, gap: float = 0.0
) -> list[WordTiming]:
    out: list[WordTiming] = []
    t = start
    for i in range(n):
        out.append(WordTiming(word=f"w{i}", start=t, end=t + step * 0.8))
        t += step
        if gap_every and (i + 1) % gap_every == 0:
            t += gap
    return out


def _items(report: Any) -> dict[str, Any]:
    return {item.key: item for item in report.items}


def _prosody(**overrides: Any) -> ProsodySummary:
    base: dict[str, Any] = {
        "frames": 400,
        "voiced_frames": 300,
        "pitch_std_semitones": 4.0,
        "pitch_median_hz": 180.0,
        "energy_cv": 0.9,
        "volume_std_db": 5.0,
        "mean_db": -30.0,
    }
    base.update(overrides)
    return ProsodySummary(**base)


def test_a_steady_comfortable_answer_rates_well_on_timing() -> None:
    words = _words(90, step=0.4)  # 150 wpm
    report = delivery.build_delivery(words, duration_s=37.0, wpm=150, prosody=None)
    assert report is not None
    items = _items(report)
    assert items["pace"].rating == "good"
    assert items["latency"].rating == "good"
    assert items["pauses"].rating == "good"
    assert report.voice_measured is False


def test_too_fast_and_too_slow_are_flagged() -> None:
    words = _words(60)
    fast = delivery.build_delivery(words, duration_s=24.0, wpm=190, prosody=None)
    slow = delivery.build_delivery(words, duration_s=24.0, wpm=80, prosody=None)
    assert fast is not None and slow is not None
    assert _items(fast)["pace"].rating == "needs_work"
    assert "fast" in _items(fast)["pace"].detail
    assert _items(slow)["pace"].rating == "needs_work"
    assert "slow" in _items(slow)["pace"].detail


def test_a_late_start_and_long_pauses_are_flagged() -> None:
    words = _words(60, start=6.0, gap_every=10, gap=3.0)
    report = delivery.build_delivery(words, duration_s=45.0, wpm=130, prosody=None)
    assert report is not None
    items = _items(report)
    assert items["latency"].rating == "needs_work"
    assert items["pauses"].rating == "needs_work"
    assert any("Long silences" in line for line in report.advice)


def test_rhythm_needs_enough_phrases_to_be_judged() -> None:
    report = delivery.build_delivery(_words(10), duration_s=5.0, wpm=120, prosody=None)
    assert report is not None
    assert _items(report)["rhythm"].rating == "not_measured"


def test_uneven_phrasing_is_flagged() -> None:
    long_run = _words(40, step=0.3)
    t = long_run[-1].end + 1.0
    fragments: list[WordTiming] = []
    for i in range(6):
        fragments.append(WordTiming(word=f"f{i}", start=t, end=t + 0.3))
        t += 1.3
    report = delivery.build_delivery([*long_run, *fragments], duration_s=t, wpm=130, prosody=None)
    assert report is not None
    assert _items(report)["rhythm"].rating == "needs_work"


def test_no_timing_data_means_no_delivery_report() -> None:
    assert delivery.build_delivery([], duration_s=10, wpm=0, prosody=None) is None
    assert delivery.build_delivery(_words(1), duration_s=10, wpm=1, prosody=None) is None


# ─── voice measurements (pure) ───────────────────────────────────────────


def test_a_flat_voice_gets_actionable_advice_not_a_number() -> None:
    report = delivery.build_delivery(
        _words(90),
        duration_s=37.0,
        wpm=150,
        prosody=_prosody(pitch_std_semitones=0.9, energy_cv=0.2),
    )
    assert report is not None
    items = _items(report)
    assert items["pitch"].rating == "needs_work"
    assert items["energy"].rating == "needs_work"
    assert items["monotony"].rating == "needs_work"
    assert report.voice_measured is True
    assert report.advice[0].startswith("Your pace was controlled, but")
    assert "Emphasising important decisions" in report.advice[0]
    assert not any(ch.isdigit() for ch in report.advice[0])  # advice, not "prosody score 62"


def test_one_flat_signal_is_only_partial_monotony() -> None:
    report = delivery.build_delivery(
        _words(90), duration_s=37.0, wpm=150, prosody=_prosody(energy_cv=0.2)
    )
    assert report is not None
    assert _items(report)["monotony"].rating == "ok"


def test_a_varied_steady_voice_rates_well() -> None:
    report = delivery.build_delivery(_words(90), duration_s=37.0, wpm=150, prosody=_prosody())
    assert report is not None
    items = _items(report)
    assert {items[k].rating for k in ("pitch", "energy", "volume", "monotony")} == {"good"}
    assert "solid" in report.advice[0]


def test_a_quiet_or_unsteady_voice_is_flagged() -> None:
    quiet = delivery.build_delivery(
        _words(90), duration_s=37.0, wpm=150, prosody=_prosody(mean_db=-58.0)
    )
    swingy = delivery.build_delivery(
        _words(90), duration_s=37.0, wpm=150, prosody=_prosody(volume_std_db=12.0)
    )
    assert quiet is not None and swingy is not None
    assert _items(quiet)["volume"].rating == "needs_work"
    assert _items(swingy)["volume"].rating == "ok"


def test_too_little_voiced_audio_is_reported_as_not_measured() -> None:
    report = delivery.build_delivery(
        _words(90), duration_s=37.0, wpm=150, prosody=_prosody(voiced_frames=5)
    )
    assert report is not None
    assert report.voice_measured is False
    assert _items(report)["pitch"].rating == "not_measured"


def test_untrackable_pitch_is_not_invented() -> None:
    report = delivery.build_delivery(
        _words(90), duration_s=37.0, wpm=150, prosody=_prosody(pitch_std_semitones=None)
    )
    assert report is not None
    assert _items(report)["pitch"].rating == "not_measured"
    assert _items(report)["energy"].rating != "not_measured"


def test_advice_is_capped_at_three_items() -> None:
    report = delivery.build_delivery(
        _words(60, start=6.0, gap_every=10, gap=3.0),
        duration_s=45.0,
        wpm=190,
        prosody=_prosody(pitch_std_semitones=0.5, energy_cv=0.1, mean_db=-60),
    )
    assert report is not None
    assert len(report.advice) <= 3


# ─── camera coach (pure) ─────────────────────────────────────────────────


def _camera(**overrides: Any) -> CameraSummary:
    base: dict[str, Any] = {
        "frames": 300,
        "duration_s": 60.0,
        "face_present_ratio": 0.97,
        "looking_away_ratio": 0.1,
        "away_events": 3,
        "head_motion_deg_per_s": 6.0,
    }
    base.update(overrides)
    return CameraSummary(**base)


def test_a_steady_framed_presentation_is_reported_as_such() -> None:
    visual = delivery.build_visual_delivery(_camera())
    assert visual is not None
    assert {item.rating for item in visual.items} == {"good"}
    assert "steady" in visual.advice[0]


def test_looking_away_and_movement_get_presentation_advice() -> None:
    visual = delivery.build_visual_delivery(
        _camera(looking_away_ratio=0.6, head_motion_deg_per_s=40.0, face_present_ratio=0.5)
    )
    assert visual is not None
    ratings = {item.key: item.rating for item in visual.items}
    assert ratings == {
        "framing": "needs_work",
        "looking_away": "needs_work",
        "movement": "needs_work",
    }
    assert len(visual.advice) == 3


def test_the_camera_report_never_makes_claims_about_character_or_emotion() -> None:
    visual = delivery.build_visual_delivery(_camera(looking_away_ratio=0.6))
    assert visual is not None
    text = " ".join([visual.disclaimer, *visual.advice, *(i.detail for i in visual.items)]).lower()
    for forbidden in ("lying", "nervous", "dishonest", "untrustworthy", "anxious", "emotion:"):
        assert forbidden not in text
    assert "honesty" in visual.disclaimer  # the disclaimer rules these out explicitly


def test_too_few_camera_frames_means_no_visual_report() -> None:
    assert delivery.build_visual_delivery(_camera(frames=5)) is None
    assert delivery.build_visual_delivery(None) is None


def test_summaries_reject_out_of_range_numbers() -> None:
    with pytest.raises(ValueError):
        _camera(looking_away_ratio=1.5)
    with pytest.raises(ValueError):
        _prosody(pitch_median_hz=5000)


# ─── API ─────────────────────────────────────────────────────────────────


def _feedback() -> LLMFeedback:
    return LLMFeedback(
        rubric=TechnicalRubric(correctness=6, depth=6, tradeoffs=6, communication=6),
        clarity=6,
        on_topic=True,
        strengths=["Clear."],
        improvements=["Go deeper."],
        evidence=[],
        rambling_notes="",
        reference_answer="A reference answer.",
        follow_up_question="Why?",
    )


@pytest.fixture(autouse=True)
def _mocked_providers(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_transcribe(
        audio_bytes: bytes, filename: str, language: str | None = None
    ) -> TranscriptionResult:
        words = _words(60)
        return TranscriptionResult(
            transcript=" ".join(w.word for w in words), words=words, duration_s=25.0
        )

    async def fake_feedback(**kwargs: Any) -> LLMFeedback:
        return _feedback()

    monkeypatch.setattr(stt, "transcribe", fake_transcribe)
    monkeypatch.setattr(llm, "generate_feedback", fake_feedback)


async def _session(client: TestClient, db: AsyncSession, user: dict[str, Any]) -> dict[str, Any]:
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
    return _create_session(client, user, focus="technical")


def _submit(
    client: TestClient, user: dict[str, Any], session: dict[str, Any], **form: str
) -> dict[str, Any]:
    response = client.post(
        "/v1/answers",
        data={
            "session_id": session["id"],
            "session_question_id": session["current_question"]["id"],
            **form,
        },
        files={"audio": ("a.webm", b"\x1a\x45\xdf\xa3audio", "audio/webm")},
        headers=_auth_headers(user),
    )
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


async def test_an_answer_always_gets_timing_based_delivery_coaching(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    session = await _session(client, db_session, user)

    report = _submit(client, user, session)

    keys = [item["key"] for item in report["delivery"]["items"]]
    assert keys[:4] == ["pace", "pauses", "latency", "rhythm"]
    assert report["delivery"]["voice_measured"] is False
    assert report["visual_delivery"] is None


async def test_browser_measured_voice_data_is_validated_stored_and_reported(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    session = await _session(client, db_session, user)
    prosody = _prosody(pitch_std_semitones=0.8, energy_cv=0.2).model_dump()

    report = _submit(client, user, session, prosody=json.dumps(prosody))

    assert report["delivery"]["voice_measured"] is True
    by_key = {i["key"]: i for i in report["delivery"]["items"]}
    assert by_key["monotony"]["rating"] == "needs_work"
    again = client.get(f"/v1/answers/{report['id']}", headers=_auth_headers(user)).json()
    assert again["delivery"] == report["delivery"]  # stored, not recomputed from the request


async def test_malformed_or_out_of_range_voice_data_is_ignored_not_fatal(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    session = await _session(client, db_session, user)
    bad = _prosody().model_dump() | {"energy_cv": 999}

    for raw in ("not json", json.dumps(bad), "{}"):
        fresh = await _session(client, db_session, user)
        report = _submit(client, user, fresh, prosody=raw)
        assert report["delivery"]["voice_measured"] is False
    assert session  # first session untouched


async def test_oversized_summary_fields_are_rejected_before_parsing(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    session = await _session(client, db_session, user)
    response = client.post(
        "/v1/answers",
        data={
            "session_id": session["id"],
            "session_question_id": session["current_question"]["id"],
            "prosody": "x" * 5000,
        },
        files={"audio": ("a.webm", b"\x1a\x45\xdf\xa3audio", "audio/webm")},
        headers=_auth_headers(user),
    )
    assert response.status_code == 422


async def test_camera_data_is_ignored_while_the_feature_is_off(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    session = await _session(client, db_session, user)

    report = _submit(client, user, session, camera=_camera().model_dump_json())

    assert report["visual_delivery"] is None
    features = client.get("/v1/features", headers=_auth_headers(user)).json()
    assert features["camera_coach"] is False


async def test_camera_data_is_reported_separately_when_the_feature_is_on(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(get_settings(), "enable_camera_coach", True)
    user = register_user()
    session = await _session(client, db_session, user)

    report = _submit(
        client, user, session, camera=_camera(looking_away_ratio=0.6).model_dump_json()
    )

    visual = report["visual_delivery"]
    assert {i["key"] for i in visual["items"]} == {"framing", "looking_away", "movement"}
    assert "honesty" in visual["disclaimer"]
    # Content scoring is untouched by anything the camera saw.
    assert report["feedback"]["rubric"]["correctness"] == 6
    assert "visual" not in json.dumps(report["feedback"]).lower()
    assert client.get("/v1/features", headers=_auth_headers(user)).json()["camera_coach"] is True


async def test_older_answers_without_summaries_still_render(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    session = await _session(client, db_session, user)
    report = _submit(client, user, session)
    from app.services import repo

    answer = await repo.get_answer_for_user(
        db_session, answer_id=report["id"], user_id=user["user"]["id"]
    )
    assert answer is not None
    answer.prosody = None
    answer.camera = None
    answer.words = []
    db_session.add(answer)
    await db_session.commit()

    again = client.get(f"/v1/answers/{report['id']}", headers=_auth_headers(user))
    assert again.status_code == 200
    assert again.json()["delivery"] is None
