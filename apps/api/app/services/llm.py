from typing import Any

from fastapi import status
from groq import APIStatusError, AsyncGroq
from groq.types.chat import ChatCompletionMessageParam
from pydantic import ValidationError

from app.core.config import get_settings
from app.core.errors import ApiError
from app.models.enums import Category
from app.prompts.feedback import build_messages
from app.prompts.resume import build_messages as build_resume_messages
from app.schemas.feedback import LLMFeedback
from app.schemas.resume import ResumeExtraction
from app.services.groq_retry import REQUEST_TIMEOUT_S, is_retryable

_TEMPERATURE = 0.3
# Generous enough for a rich feedback object (rubric + strengths/improvements/evidence + a
# ~150-250 word rewritten/reference answer) while still bounding cost and latency on a runaway
# completion.
_MAX_COMPLETION_TOKENS = 1500
# A resume extraction is just a short summary + a skills list — far cheaper than a feedback
# object, so it gets its own, much tighter cap.
_MAX_RESUME_COMPLETION_TOKENS = 600


def _client() -> AsyncGroq:
    settings = get_settings()
    return AsyncGroq(api_key=settings.groq_api_key, timeout=REQUEST_TIMEOUT_S)


async def _create_completion(
    client: AsyncGroq,
    model: str,
    messages: list[ChatCompletionMessageParam],
    *,
    max_tokens: int = _MAX_COMPLETION_TOKENS,
) -> str:
    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        response_format={"type": "json_object"},
        temperature=_TEMPERATURE,
        max_tokens=max_tokens,
    )
    content = response.choices[0].message.content
    if not content:
        raise ApiError(
            "llm_failed",
            "The model returned an empty response.",
            status_code=status.HTTP_502_BAD_GATEWAY,
        )
    return content


async def _complete(
    messages: list[ChatCompletionMessageParam], *, max_tokens: int = _MAX_COMPLETION_TOKENS
) -> str:
    """Same timeout + one-retry-on-429/5xx policy as stt.py's Groq call — separate from, and
    on top of, generate_feedback's/extract_resume_data's own retry for a validation failure
    below."""
    settings = get_settings()
    client = _client()

    try:
        return await _create_completion(
            client, settings.groq_llm_model, messages, max_tokens=max_tokens
        )
    except APIStatusError as exc:
        if not is_retryable(exc):
            raise ApiError(
                "llm_failed",
                "The feedback model is unavailable.",
                status_code=status.HTTP_502_BAD_GATEWAY,
            ) from exc
        try:
            return await _create_completion(
                client, settings.groq_llm_model, messages, max_tokens=max_tokens
            )
        except APIStatusError as retry_exc:
            raise ApiError(
                "llm_failed",
                "The feedback model is unavailable after retry.",
                status_code=status.HTTP_502_BAD_GATEWAY,
            ) from retry_exc


class _RubricCategoryMismatchError(Exception):
    """The model ignored the "score it using exactly that rubric shape" instruction — this gets
    fed back and retried exactly like any other shape validation failure, not silently accepted
    with the wrong rubric."""


def _parse(raw: str, *, expected_category: Category) -> LLMFeedback:
    feedback = LLMFeedback.model_validate_json(raw)
    if feedback.rubric.category != expected_category.value:
        raise _RubricCategoryMismatchError(
            f"expected rubric.category={expected_category.value!r}, got "
            f"{feedback.rubric.category!r}"
        )
    return feedback


async def generate_feedback(
    *,
    role: str,
    category: Category,
    question_text: str,
    transcript: str,
    candidate_context: dict[str, Any],
) -> LLMFeedback:
    """Calls the LLM once; on a validation failure (malformed JSON, a shape that doesn't match
    LLMFeedback, or a rubric category that doesn't match the question's actual category)
    retries exactly once with the validation error fed back so the model can correct itself. A
    second failure is a 502 — feedback quality matters more than always returning something,
    and the LLM never sees or emits filler/WPM/pause numbers here.

    `candidate_context` (company/industry/job description/background/skills/focus topics/years
    experience/interviewer style) and `transcript` are untrusted, candidate-supplied content —
    see app/prompts/feedback.py's system prompt for how the model is told to treat them as data,
    never instructions."""
    messages = build_messages(
        role=role,
        category=category,
        question_text=question_text,
        transcript=transcript,
        candidate_context=candidate_context,
    )

    raw = await _complete(messages)
    try:
        return _parse(raw, expected_category=category)
    except (ValidationError, _RubricCategoryMismatchError) as first_error:
        retry_messages: list[ChatCompletionMessageParam] = [
            *messages,
            {"role": "assistant", "content": raw},
            {
                "role": "user",
                "content": (
                    f"That response was invalid: {first_error}. Return ONLY the corrected "
                    "JSON object, matching the required shape exactly."
                ),
            },
        ]
        raw_retry = await _complete(retry_messages)
        try:
            return _parse(raw_retry, expected_category=category)
        except (ValidationError, _RubricCategoryMismatchError) as second_error:
            raise ApiError(
                "llm_failed",
                "The model could not produce valid feedback.",
                status_code=status.HTTP_502_BAD_GATEWAY,
            ) from second_error


async def extract_resume_data(resume_text: str) -> ResumeExtraction:
    """Same one-retry-on-validation-failure shape as generate_feedback above, for the much
    smaller job of pulling a background summary/skills/years-of-experience out of resume text —
    see app/prompts/resume.py for the injection-defense framing. `resume_text` is untrusted,
    candidate-supplied content, same as a transcript is."""
    messages = build_resume_messages(resume_text)

    raw = await _complete(messages, max_tokens=_MAX_RESUME_COMPLETION_TOKENS)
    try:
        return ResumeExtraction.model_validate_json(raw)
    except ValidationError as first_error:
        retry_messages: list[ChatCompletionMessageParam] = [
            *messages,
            {"role": "assistant", "content": raw},
            {
                "role": "user",
                "content": (
                    f"That response was invalid: {first_error}. Return ONLY the corrected "
                    "JSON object, matching the required shape exactly."
                ),
            },
        ]
        raw_retry = await _complete(retry_messages, max_tokens=_MAX_RESUME_COMPLETION_TOKENS)
        try:
            return ResumeExtraction.model_validate_json(raw_retry)
        except ValidationError as second_error:
            raise ApiError(
                "llm_failed",
                "The model could not extract data from that resume.",
                status_code=status.HTTP_502_BAD_GATEWAY,
            ) from second_error
