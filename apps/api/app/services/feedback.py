"""Assembles a persisted Answer row from the two independent sources that feed it — the
code-computed metrics (app/services/metrics.py) and the LLM's feedback (app/services/llm.py)
— and reassembles the reverse for the API response. Keeping the split/join logic in one place
means the DB's flattened columns and the API's nested LLMFeedback shape can never drift apart
without both directions of this module breaking."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.interview_session import InterviewSession
from app.schemas.answer import AnswerReport
from app.schemas.feedback import LLMFeedback, StarScores
from app.schemas.session import SessionQuestionOut
from app.schemas.transcription import TranscriptionResult, WordTiming
from app.services import metrics, repo


def build_answer(
    *,
    session_id: str,
    user_id: str,
    question_id: str | None,
    session_question_id: str,
    question_text: str,
    transcription: TranscriptionResult,
    feedback: LLMFeedback,
) -> Answer:
    filler_count, filler_breakdown = metrics.count_fillers(transcription.transcript)

    return Answer(
        session_id=session_id,
        user_id=user_id,
        question_id=question_id,
        session_question_id=session_question_id,
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


async def to_answer_report(
    db: AsyncSession, *, answer: Answer, session: InterviewSession
) -> AnswerReport:
    feedback_blob = answer.feedback or {}
    words = [WordTiming.model_validate(word) for word in answer.words]

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
        question_text=answer.question_text,
        transcript=answer.transcript,
        transcript_parts=metrics.build_transcript_parts(words),
        duration_s=float(answer.duration_s),
        wpm=float(answer.wpm),
        filler_count=answer.filler_count,
        filler_breakdown=answer.filler_breakdown,
        long_pauses=answer.long_pauses,
        rambling=answer.rambling,
        confidence_note=metrics.assess_confidence(answer.filler_count, len(words)),
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
        question_number=question_number,
        question_count=session.question_count,
        session_status=session.status,
        next_question=next_question_out,
    )
