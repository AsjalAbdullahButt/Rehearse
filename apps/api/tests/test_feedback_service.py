from app.models.enums import Category
from app.schemas.feedback import BehavioralRubric, LLMFeedback, TechnicalRubric
from app.schemas.transcription import TranscriptionResult, WordTiming
from app.services.feedback import _verified_evidence, build_answer


def test_verified_evidence_keeps_a_quote_that_appears_in_the_transcript() -> None:
    transcript = "I designed a token bucket rate limiter for the payments service."

    result = _verified_evidence(["I designed a token bucket rate limiter"], transcript=transcript)

    assert result == ["I designed a token bucket rate limiter"]


def test_verified_evidence_drops_a_fabricated_quote() -> None:
    transcript = "I designed a token bucket rate limiter for the payments service."

    result = _verified_evidence(
        ["I single-handedly rewrote the entire payments platform in a weekend"],
        transcript=transcript,
    )

    assert result == []


def test_verified_evidence_tolerates_whitespace_and_punctuation_differences() -> None:
    transcript = "Well,   I think the   main issue was scaling."

    result = _verified_evidence(["I think the main issue was scaling"], transcript=transcript)

    assert result == ["I think the main issue was scaling"]


def test_verified_evidence_keeps_only_the_real_quotes_out_of_a_mixed_list() -> None:
    transcript = "The bottleneck was the database connection pool."

    result = _verified_evidence(
        ["the database connection pool", "an entirely made-up quote about rockets"],
        transcript=transcript,
    )

    assert result == ["the database connection pool"]


def _fake_transcription() -> TranscriptionResult:
    transcript = "I designed a token bucket rate limiter."
    words = [
        WordTiming(word=word, start=i * 0.5, end=i * 0.5 + 0.4)
        for i, word in enumerate(transcript.split())
    ]
    return TranscriptionResult(transcript=transcript, words=words, duration_s=10.0)


def test_build_answer_drops_fabricated_evidence_before_persisting() -> None:
    feedback = LLMFeedback(
        rubric=TechnicalRubric(correctness=8, depth=7, tradeoffs=6, communication=8),
        clarity=8,
        on_topic=True,
        strengths=["Explained the approach clearly."],
        improvements=["Discuss tradeoffs more."],
        evidence=["I designed a token bucket rate limiter", "a completely fabricated quote"],
        rambling_notes="",
        reference_answer="A fresh example answer.",
        follow_up_question="How would you scale this further?",
    )

    answer = build_answer(
        session_id="session-1",
        user_id="user-1",
        question_id="question-1",
        session_question_id="session-question-1",
        question_text="How would you design a rate limiter?",
        category=Category.TECHNICAL,
        answer_cap_s=120,
        transcription=_fake_transcription(),
        feedback=feedback,
    )

    assert answer.feedback is not None
    assert answer.feedback["evidence"] == ["I designed a token bucket rate limiter"]
    assert answer.category == "technical"
    assert answer.answer_example == "A fresh example answer."
    assert answer.rubric == {
        "category": "technical",
        "correctness": 8,
        "depth": 7,
        "tradeoffs": 6,
        "communication": 8,
    }


def test_build_answer_stores_rewritten_answer_for_behavioral_questions() -> None:
    feedback = LLMFeedback(
        rubric=BehavioralRubric(situation=7, task=7, action=8, result=7),
        clarity=8,
        on_topic=True,
        strengths=["Clear structure."],
        improvements=["Add more detail on impact."],
        rambling_notes="",
        rewritten_answer="A cleaned-up version of the candidate's own answer.",
        follow_up_question="What would you do differently?",
    )

    answer = build_answer(
        session_id="session-1",
        user_id="user-1",
        question_id=None,
        session_question_id="session-question-1",
        question_text="Tell me about a time you resolved a conflict.",
        category=Category.BEHAVIORAL,
        answer_cap_s=120,
        transcription=_fake_transcription(),
        feedback=feedback,
    )

    assert answer.answer_example == "A cleaned-up version of the candidate's own answer."
    assert answer.category == "behavioral"
