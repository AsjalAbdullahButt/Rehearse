"""Assembles a persisted Answer row from the two independent sources that feed it — the
code-computed metrics (app/services/metrics.py) and the LLM's feedback (app/services/llm.py)
— and reassembles the reverse for the API response. Keeping the split/join logic in one place
means the DB's flattened columns and the API's nested LLMFeedback shape can never drift apart
without both directions of this module breaking."""

from app.models.answer import Answer
from app.schemas.answer import AnswerReport
from app.schemas.feedback import LLMFeedback, StarScores
from app.schemas.transcription import TranscriptionResult
from app.services import metrics


def build_answer(
    *,
    session_id: str,
    user_id: str,
    question_id: str,
    question_text: str,
    transcription: TranscriptionResult,
    feedback: LLMFeedback,
) -> Answer:
    filler_count, filler_breakdown = metrics.count_fillers(transcription.transcript)

    return Answer(
        session_id=session_id,
        user_id=user_id,
        question_id=question_id,
        question_text=question_text,
        transcript=transcription.transcript,
        words=[word.model_dump() for word in transcription.words],
        duration_s=transcription.duration_s,
        wpm=metrics.compute_wpm(len(transcription.words), transcription.duration_s),
        filler_count=filler_count,
        filler_breakdown=filler_breakdown,
        long_pauses=metrics.count_long_pauses(transcription.words),
        rambling=metrics.assess_rambling(transcription.duration_s),
        star=feedback.star.model_dump(),
        clarity=feedback.clarity,
        on_topic=feedback.on_topic,
        feedback={
            "tips": feedback.tips,
            "rambling_notes": feedback.rambling_notes,
            "follow_up_question": feedback.follow_up_question,
        },
        sample_answer=feedback.sample_answer,
    )


def to_answer_report(answer: Answer) -> AnswerReport:
    feedback_blob = answer.feedback or {}

    return AnswerReport(
        id=answer.id,
        session_id=answer.session_id,
        question_id=answer.question_id,
        question_text=answer.question_text,
        transcript=answer.transcript,
        duration_s=float(answer.duration_s),
        wpm=float(answer.wpm),
        filler_count=answer.filler_count,
        filler_breakdown=answer.filler_breakdown,
        long_pauses=answer.long_pauses,
        rambling=answer.rambling,
        feedback=LLMFeedback(
            star=StarScores(**(answer.star or {})),
            clarity=answer.clarity or 0,
            on_topic=bool(answer.on_topic),
            rambling_notes=feedback_blob.get("rambling_notes", ""),
            tips=feedback_blob.get("tips", []),
            sample_answer=answer.sample_answer or "",
            follow_up_question=feedback_blob.get("follow_up_question", ""),
        ),
        created_at=answer.created_at,
    )
