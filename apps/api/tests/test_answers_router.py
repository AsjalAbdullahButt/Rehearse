from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.answer import Answer
from app.models.enums import Category, Difficulty, Role
from app.models.question import Question
from app.routers.answers import MAX_AUDIO_BYTES, UPLOAD_CHUNK_BYTES, _read_capped
from app.schemas.feedback import LLMFeedback, StarScores
from app.schemas.transcription import TranscriptionResult, WordTiming
from app.services import llm, repo, stt


def _auth_headers(user: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {user['access_token']}"}


async def _seed_question(
    db_session: AsyncSession,
    *,
    role: Role = Role.BACKEND,
    difficulty: Difficulty = Difficulty.MEDIUM,
) -> str:
    question = Question(
        role=role,
        difficulty=difficulty,
        category=Category.TECHNICAL,
        text="How would you design a rate limiter?",
    )
    db_session.add(question)
    await db_session.commit()
    await db_session.refresh(question)
    return question.id


def _create_session(
    client: TestClient, user: dict[str, Any], *, role: str = "backend", difficulty: str = "medium"
) -> str:
    response = client.post(
        "/v1/sessions",
        json={"role": role, "difficulty": difficulty},
        headers=_auth_headers(user),
    )
    assert response.status_code == 201
    session_id: str = response.json()["id"]
    return session_id


def _fake_transcription(
    transcript: str = "I designed a token bucket rate limiter.", duration_s: float = 30.0
) -> TranscriptionResult:
    words = [
        WordTiming(word=word, start=i * 0.5, end=i * 0.5 + 0.4)
        for i, word in enumerate(transcript.split())
    ]
    return TranscriptionResult(transcript=transcript, words=words, duration_s=duration_s)


def _fake_feedback() -> LLMFeedback:
    return LLMFeedback(
        star=StarScores(situation=7, task=7, action=8, result=7),
        clarity=8,
        on_topic=True,
        rambling_notes="",
        tips=["Be more specific.", "Quantify the impact.", "Mention tradeoffs."],
        sample_answer="A stronger sample answer would open with the constraint...",
        follow_up_question="How would you handle a burst of traffic?",
    )


def _post_answer(
    client: TestClient,
    *,
    session_id: str,
    question_id: str,
    user: dict[str, Any],
    time_cap_s: int = 120,
    content_type: str = "audio/webm",
    audio_bytes: bytes = b"\x1a\x45\xdf\xa3fake-webm-bytes",
    idempotency_key: str | None = None,
) -> Any:
    headers = _auth_headers(user)
    if idempotency_key is not None:
        headers["Idempotency-Key"] = idempotency_key
    return client.post(
        "/v1/answers",
        data={
            "session_id": session_id,
            "question_id": question_id,
            "time_cap_s": str(time_cap_s),
        },
        files={"audio": ("answer.webm", audio_bytes, content_type)},
        headers=headers,
    )


@pytest.fixture(autouse=True)
def _mock_groq(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_transcribe(audio_bytes: bytes, filename: str) -> TranscriptionResult:
        return _fake_transcription()

    async def fake_generate_feedback(
        *, role: str, question_text: str, transcript: str
    ) -> LLMFeedback:
        return _fake_feedback()

    monkeypatch.setattr(stt, "transcribe", fake_transcribe)
    monkeypatch.setattr(llm, "generate_feedback", fake_generate_feedback)


async def test_create_answer_happy_path(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    response = _post_answer(client, session_id=session_id, question_id=question_id, user=user)

    assert response.status_code == 201
    body = response.json()
    assert body["transcript"] == "I designed a token bucket rate limiter."
    assert body["session_id"] == session_id
    assert body["question_id"] == question_id
    assert body["feedback"]["star"]["action"] == 8
    assert body["feedback"]["tips"] == [
        "Be more specific.",
        "Quantify the impact.",
        "Mention tradeoffs.",
    ]
    assert body["filler_count"] == 0
    assert body["wpm"] > 0
    assert body["confidence_note"] is None


async def test_create_answer_includes_a_confidence_note_for_a_high_filler_rate(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 5 fillers in 10 words (50% rate) — well past both the count and rate thresholds in
    # metrics.assess_confidence.
    async def filler_heavy_transcribe(audio_bytes: bytes, filename: str) -> TranscriptionResult:
        return _fake_transcription("um so uh basically I um think uh it um works")

    monkeypatch.setattr(stt, "transcribe", filler_heavy_transcribe)

    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    response = _post_answer(client, session_id=session_id, question_id=question_id, user=user)

    assert response.status_code == 201
    body = response.json()
    assert body["confidence_note"] is not None
    assert "confident" in body["confidence_note"]


async def test_create_answer_is_idempotent_on_a_repeated_key(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    call_count = 0

    async def counting_transcribe(audio_bytes: bytes, filename: str) -> TranscriptionResult:
        nonlocal call_count
        call_count += 1
        return _fake_transcription()

    monkeypatch.setattr(stt, "transcribe", counting_transcribe)

    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    first = _post_answer(
        client,
        session_id=session_id,
        question_id=question_id,
        user=user,
        idempotency_key="retry-key-1",
    )
    second = _post_answer(
        client,
        session_id=session_id,
        question_id=question_id,
        user=user,
        idempotency_key="retry-key-1",
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    # The retry must not have reprocessed the audio through Groq again.
    assert call_count == 1

    all_answers = await repo.list_answers_for_user(db_session, user_id=user["user"]["id"])
    assert len(all_answers) == 1


async def test_create_answer_treats_a_different_key_as_a_new_answer(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    first = _post_answer(
        client,
        session_id=session_id,
        question_id=question_id,
        user=user,
        idempotency_key="key-a",
    )
    second = _post_answer(
        client,
        session_id=session_id,
        question_id=question_id,
        user=user,
        idempotency_key="key-b",
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]


async def test_create_answer_computes_fillers_from_the_transcript(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_transcribe(audio_bytes: bytes, filename: str) -> TranscriptionResult:
        return _fake_transcription(transcript="Um, so, uh, I basically built a rate limiter.")

    monkeypatch.setattr(stt, "transcribe", fake_transcribe)

    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    response = _post_answer(client, session_id=session_id, question_id=question_id, user=user)

    assert response.status_code == 201
    assert response.json()["filler_count"] == 3


async def test_create_answer_rejects_unknown_session(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)

    response = _post_answer(client, session_id="does-not-exist", question_id=question_id, user=user)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "session_not_found"


async def test_create_answer_rejects_another_users_session(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user_a = register_user("a@example.com")
    user_b = register_user("b@example.com")
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user_a)

    response = _post_answer(client, session_id=session_id, question_id=question_id, user=user_b)

    assert response.status_code == 404


async def test_create_answer_rejects_unknown_question(
    client: TestClient, register_user: Callable[..., dict[str, Any]]
) -> None:
    user = register_user()
    session_id = _create_session(client, user)

    response = _post_answer(client, session_id=session_id, question_id="does-not-exist", user=user)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "question_not_found"


async def test_create_answer_rejects_a_question_from_a_different_role(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    session_id = _create_session(client, user, role="backend", difficulty="medium")
    frontend_question_id = await _seed_question(
        db_session, role=Role.FRONTEND, difficulty=Difficulty.MEDIUM
    )

    response = _post_answer(
        client, session_id=session_id, question_id=frontend_question_id, user=user
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "question_session_mismatch"


async def test_create_answer_rejects_a_question_from_a_different_difficulty(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    session_id = _create_session(client, user, role="backend", difficulty="medium")
    hard_question_id = await _seed_question(
        db_session, role=Role.BACKEND, difficulty=Difficulty.HARD
    )

    response = _post_answer(client, session_id=session_id, question_id=hard_question_id, user=user)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "question_session_mismatch"


async def test_create_answer_rejects_non_webm_ogg_content_type(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    response = _post_answer(
        client,
        session_id=session_id,
        question_id=question_id,
        user=user,
        content_type="audio/mpeg",
    )

    assert response.status_code == 415


async def test_create_answer_accepts_a_valid_time_cap(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    response = _post_answer(
        client,
        session_id=session_id,
        question_id=question_id,
        user=user,
        time_cap_s=180,
    )

    assert response.status_code == 201


@pytest.mark.parametrize("time_cap_s", [90, -60, 0])
async def test_create_answer_rejects_a_time_cap_outside_the_allowed_choices(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    time_cap_s: int,
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    response = _post_answer(
        client,
        session_id=session_id,
        question_id=question_id,
        user=user,
        time_cap_s=time_cap_s,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_time_cap"


async def test_create_answer_rejects_a_payload_that_isnt_really_audio(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    """A spoofed Content-Type header alone shouldn't be enough — the actual bytes are sniffed
    for a real WebM/Ogg signature before anything gets sent to Groq."""
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    response = _post_answer(
        client,
        session_id=session_id,
        question_id=question_id,
        user=user,
        content_type="audio/webm",
        audio_bytes=b"this is not actually a webm file",
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_audio_content"


async def test_create_answer_accepts_a_real_ogg_signature(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    response = _post_answer(
        client,
        session_id=session_id,
        question_id=question_id,
        user=user,
        content_type="audio/ogg",
        audio_bytes=b"OggSfake-ogg-bytes",
    )

    assert response.status_code == 201


async def test_create_answer_rejects_uploads_over_4mb(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    oversized = b"0" * (4 * 1024 * 1024 + 1)
    response = _post_answer(
        client,
        session_id=session_id,
        question_id=question_id,
        user=user,
        audio_bytes=oversized,
    )

    assert response.status_code == 413


async def test_create_answer_rejects_duration_beyond_the_time_cap(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_transcribe(audio_bytes: bytes, filename: str) -> TranscriptionResult:
        return _fake_transcription(duration_s=200.0)

    monkeypatch.setattr(stt, "transcribe", fake_transcribe)

    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    response = _post_answer(
        client, session_id=session_id, question_id=question_id, user=user, time_cap_s=60
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "duration_exceeds_cap"


async def test_create_answer_rejects_silent_recordings(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_transcribe(audio_bytes: bytes, filename: str) -> TranscriptionResult:
        return _fake_transcription(transcript="   ")

    monkeypatch.setattr(stt, "transcribe", fake_transcribe)

    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    response = _post_answer(client, session_id=session_id, question_id=question_id, user=user)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "empty_transcript"


async def test_count_answers_today_locks_rows_it_reads(
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
    client: TestClient,
) -> None:
    """count_answers_today's fix for the daily-cap TOCTOU race is a `SELECT ... FOR UPDATE` —
    correct on MySQL/InnoDB (production's dialect), which takes next-key locks on the read range
    that block a concurrent transaction's INSERT into it too. SQLite (this whole suite's
    dialect) has no row/range locking and compiles FOR UPDATE away entirely, so a literal
    two-concurrent-requests race can't distinguish "fixed" from "not fixed" here without a live
    MySQL instance (unavailable in this sandbox — see AGENTS.md's other MySQL-only gaps).

    This instead captures the exact SQL count_answers_today executes against the real session
    and confirms that, compiled for MySQL, it carries FOR UPDATE — pinning that the fix is
    actually wired in, even though its locking effect can't be observed against SQLite."""
    from sqlalchemy.dialects import mysql

    user = register_user()
    captured: list[object] = []
    real_execute = db_session.execute

    async def spy_execute(statement: object, *args: object, **kwargs: object) -> object:
        captured.append(statement)
        return await real_execute(statement, *args, **kwargs)  # type: ignore[arg-type]

    db_session.execute = spy_execute  # type: ignore[method-assign]
    try:
        await repo.count_answers_today(db_session, user_id=user["user"]["id"])
    finally:
        db_session.execute = real_execute  # type: ignore[method-assign]

    assert len(captured) == 1
    compiled = str(captured[0].compile(dialect=mysql.dialect()))  # type: ignore[attr-defined]
    assert "FOR UPDATE" in compiled


async def test_create_answer_enforces_the_daily_rate_limit(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    for _ in range(30):
        db_session.add(
            Answer(
                session_id=session_id,
                user_id=user["user"]["id"],
                question_id=question_id,
                question_text="Q",
                transcript="A",
                duration_s=30,
                wpm=100,
            )
        )
    await db_session.commit()

    response = _post_answer(client, session_id=session_id, question_id=question_id, user=user)

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"


async def test_create_answer_enforces_the_per_minute_burst_limit(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    """Separate from the 30/day cap above: even a user nowhere near that cap gets stopped by
    a tighter per-minute burst limit, since each call costs real Groq usage."""
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    responses = [
        _post_answer(client, session_id=session_id, question_id=question_id, user=user)
        for _ in range(7)
    ]

    assert [r.status_code for r in responses[:6]] == [201] * 6
    assert responses[6].status_code == 429
    assert responses[6].json()["error"]["code"] == "rate_limited"
    assert "Retry-After" in responses[6].headers


async def test_get_answer_returns_the_full_report(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user = register_user()
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user)

    create_response = _post_answer(
        client, session_id=session_id, question_id=question_id, user=user
    )
    answer_id = create_response.json()["id"]

    response = client.get(f"/v1/answers/{answer_id}", headers=_auth_headers(user))

    assert response.status_code == 200
    assert response.json()["id"] == answer_id


async def test_get_answer_is_scoped_to_the_owner(
    client: TestClient,
    db_session: AsyncSession,
    register_user: Callable[..., dict[str, Any]],
) -> None:
    user_a = register_user("a@example.com")
    user_b = register_user("b@example.com")
    question_id = await _seed_question(db_session)
    session_id = _create_session(client, user_a)

    create_response = _post_answer(
        client, session_id=session_id, question_id=question_id, user=user_a
    )
    answer_id = create_response.json()["id"]

    response = client.get(f"/v1/answers/{answer_id}", headers=_auth_headers(user_b))

    assert response.status_code == 404


class _FakeUploadFile:
    """Stands in for Starlette's UploadFile, serving an effectively unbounded stream in fixed
    chunks so the test can prove `_read_capped` stops reading once the cap is crossed, instead of
    consuming (and buffering) the whole oversized payload first."""

    def __init__(self, total_bytes: int) -> None:
        self._remaining = total_bytes
        self.read_calls = 0

    async def read(self, size: int = -1) -> bytes:
        self.read_calls += 1
        take = min(size, self._remaining)
        self._remaining -= take
        return b"0" * take


async def test_read_capped_aborts_without_buffering_the_full_oversized_payload() -> None:
    # 100x the cap: if `_read_capped` buffered/consumed the whole thing before checking the
    # size, this would take hundreds of read() calls. It should abort after only a handful.
    huge_upload = _FakeUploadFile(total_bytes=MAX_AUDIO_BYTES * 100)

    with pytest.raises(ApiError) as exc_info:
        await _read_capped(huge_upload, MAX_AUDIO_BYTES)

    assert exc_info.value.status_code == 413
    assert exc_info.value.code == "payload_too_large"
    max_expected_calls = (MAX_AUDIO_BYTES // UPLOAD_CHUNK_BYTES) + 2
    assert huge_upload.read_calls <= max_expected_calls


async def test_read_capped_returns_full_bytes_when_under_the_cap() -> None:
    upload = _FakeUploadFile(total_bytes=1024)

    result = await _read_capped(upload, MAX_AUDIO_BYTES)

    assert result == b"0" * 1024
