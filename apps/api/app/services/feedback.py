"""Assembles a persisted Answer row from the two independent sources that feed it — the
code-computed metrics (app/services/metrics.py) and the LLM's feedback (app/services/llm.py)
— and reassembles the reverse for the API response. Keeping the split/join logic in one place
means the DB's flattened columns and the API's nested feedback shape can never drift apart
without both directions of this module breaking."""

import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.enums import Category
from app.models.interview_session import InterviewSession
from app.schemas.answer import AnswerReport
from app.schemas.feedback import (
    BehavioralRubric,
    FeedbackReport,
    LLMFeedback,
    Rubric,
    SituationalRubric,
    TechnicalRubric,
)
from app.schemas.session import SessionQuestionOut
from app.schemas.transcription import TranscriptionResult, WordTiming
from app.services import metrics, repo

_WHITESPACE_RE = re.compile(r"\s+")


def _normalize_for_matching(text: str) -> str:
    return _WHITESPACE_RE.sub(" ", text.lower()).strip(" .,!?;:\"'")


def _verified_evidence(evidence: list[str], *, transcript: str) -> list[str]:
    """Drops any "evidence" quote the model produced that doesn't actually appear in the
    transcript — Phase 5's anti-fabrication rule ("do not generate unsupported quotes") is
    enforced here, not just requested in the prompt. Whitespace/punctuation-normalized
    substring matching, so trivial formatting differences don't reject a real quote."""
    normalized_transcript = _normalize_for_matching(transcript)
    verified: list[str] = []
    for quote in evidence:
        normalized_quote = _normalize_for_matching(quote)
        if normalized_quote and normalized_quote in normalized_transcript:
            verified.append(quote)
    return verified


def build_answer(
    *,
    session_id: str,
    user_id: str,
    question_id: str | None,
    session_question_id: str,
    question_text: str,
    category: Category,
    answer_cap_s: int,
    transcription: TranscriptionResult,
    feedback: LLMFeedback,
) -> Answer:
    filler_counts = metrics.count_fillers(transcription.transcript)
    evidence = _verified_evidence(feedback.evidence, transcript=transcription.transcript)

    return Answer(
        session_id=session_id,
        user_id=user_id,
        question_id=question_id,
        session_question_id=session_question_id,
        category=category.value,
        question_text=question_text,
        transcript=transcription.transcript,
        words=[word.model_dump() for word in transcription.words],
        duration_s=transcription.duration_s,
        wpm=metrics.compute_wpm(len(transcription.words), transcription.duration_s),
        filler_count=filler_counts.definite_count,
        filler_breakdown=filler_counts.definite_breakdown,
        possible_filler_count=filler_counts.possible_count,
        possible_filler_breakdown=filler_counts.possible_breakdown,
        long_pauses=metrics.count_long_pauses(transcription.words),
        rambling=metrics.assess_rambling(
            transcription.words,
            duration_s=transcription.duration_s,
            answer_cap_s=answer_cap_s,
            category=category,
        ),
        transcription_quality_warning=metrics.assess_transcription_quality(
            transcription.avg_logprob, transcription.avg_no_speech_prob
        ),
        rubric=feedback.rubric.model_dump(),
        clarity=feedback.clarity,
        on_topic=feedback.on_topic,
        feedback={
            "strengths": feedback.strengths,
            "improvements": feedback.improvements,
            "evidence": evidence,
            "rambling_notes": feedback.rambling_notes,
            "missing_information": feedback.missing_information,
            "follow_up_question": feedback.follow_up_question,
        },
        answer_example=feedback.rewritten_answer or feedback.reference_answer,
    )


def _rubric_from_stored(category: Category, rubric_data: dict[str, object]) -> Rubric:
    data = {**rubric_data, "category": category.value}
    if category == Category.TECHNICAL:
        return TechnicalRubric.model_validate(data)
    if category == Category.SITUATIONAL:
        return SituationalRubric.model_validate(data)
    return BehavioralRubric.model_validate(data)


async def to_answer_report(
    db: AsyncSession, *, answer: Answer, session: InterviewSession
) -> AnswerReport:
    feedback_blob = answer.feedback or {}
    words = [WordTiming.model_validate(word) for word in answer.words]
    word_count = len(words)
    # Pre-Phase-4 rows predate category-specific rubrics entirely — "behavioral" (i.e. STAR) is
    # the only rubric that existed then, so it's the correct rendering default for them.
    category = Category(answer.category) if answer.category else Category.BEHAVIORAL

    answer_example = answer.answer_example
    is_behavioral = category == Category.BEHAVIORAL

    feedback_report = FeedbackReport(
        rubric=_rubric_from_stored(category, answer.rubric or {}),
        clarity=answer.clarity or 0,
        on_topic=bool(answer.on_topic),
        strengths=feedback_blob.get("strengths") or [],
        # Legacy rows stored `tips` (pre-Phase-4) instead of `improvements`.
        improvements=feedback_blob.get("improvements") or feedback_blob.get("tips") or [],
        evidence=feedback_blob.get("evidence", []),
        rambling_notes=feedback_blob.get("rambling_notes", ""),
        rewritten_answer=answer_example if is_behavioral else None,
        reference_answer=answer_example if not is_behavioral else None,
        missing_information=feedback_blob.get("missing_information", []),
        follow_up_question=feedback_blob.get("follow_up_question", ""),
    )

    # Defaults for the (legacy, pre-migration) case of an answer with no session_question_id —
    # treat it as if it were the session's last question, since there's no sequence to advance.
    question_number = session.question_count
    next_question_out: SessionQuestionOut | None = None
    if answer.session_question_id is not None:
        answered_question = await repo.get_session_question_for_session(
            db, session_question_id=answer.session_question_id, session_id=session.id
        )
        if answered_question is not None:
            question_number = answered_question.sequence_number
            if question_number < session.question_count:
                session_questions = await repo.list_session_questions_for_session(
                    db, session_id=session.id
                )
                next_question = next(
                    (sq for sq in session_questions if sq.sequence_number == question_number + 1),
                    None,
                )
                if next_question is not None:
                    next_question_out = SessionQuestionOut.model_validate(next_question)

    return AnswerReport(
        id=answer.id,
        session_id=answer.session_id,
        question_id=answer.question_id,
        session_question_id=answer.session_question_id,
        category=category,
        question_text=answer.question_text,
        transcript=answer.transcript,
        transcript_parts=metrics.build_transcript_parts(words),
        duration_s=float(answer.duration_s),
        wpm=float(answer.wpm),
        word_count=word_count,
        filler_count=answer.filler_count,
        filler_breakdown=answer.filler_breakdown,
        possible_filler_count=answer.possible_filler_count,
        possible_filler_breakdown=answer.possible_filler_breakdown,
        filler_rate_per_100_words=metrics.filler_rate_per_100_words(
            answer.filler_count, word_count
        ),
        long_pauses=answer.long_pauses,
        max_pause_s=metrics.max_pause_s(words),
        total_long_pause_s=metrics.total_long_pause_s(words),
        avg_pause_s=metrics.avg_pause_s(words),
        rambling=answer.rambling,
        confidence_note=metrics.assess_confidence(answer.filler_count, word_count),
        transcription_quality_warning=answer.transcription_quality_warning,
        feedback=feedback_report,
        created_at=answer.created_at,
        question_number=question_number,
        question_count=session.question_count,
        session_status=session.status,
        next_question=next_question_out,
    )
