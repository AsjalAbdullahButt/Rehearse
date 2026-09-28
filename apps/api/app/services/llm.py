import logging
from typing import Any, cast

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

logger = logging.getLogger("rehearse.api")


def _safe_groq_error_summary(exc: APIStatusError) -> str:
    """A bounded, structure-only summary for logging — deliberately never the error's own
    "message" field, since some providers echo fragments of the request back into it (e.g.
    "Invalid 'messages[1].content': ..."), which could leak candidate resume/transcript text
    into logs. Only the error "type"/"code" (a fixed, provider-defined enum-like string, not
    user content) is logged, matching this project's no-PII-in-logs rule."""
    body = exc.body
    if isinstance(body, dict):
        error = cast(dict[str, object], body).get("error")
        if isinstance(error, dict):
            typed_error = cast(dict[str, object], error)
            return f"type={typed_error.get('type')!r} code={typed_error.get('code')!r}"
    return "body=<unavailable>"


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
            # Logged server-side only, never in the client-facing message — a 4xx here almost
            # always means something about this specific request (not Groq being down), so the
            # error's type/code is the only way to tell a bad model name from a content-policy
            # rejection from a context-length overflow without guessing (see
            # _safe_groq_error_summary's docstring for why the raw message is never logged).
            logger.warning(
                "groq_completion_failed status=%s %s",
                exc.status_code,
                _safe_groq_error_summary(exc),
            )
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
            logger.warning(
                "groq_completion_failed_after_retry status=%s %s",
                retry_exc.status_code,
                _safe_groq_error_summary(retry_exc),
            )
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


def _reject_if_not_resume(extraction: ResumeExtraction) -> ResumeExtraction:
    """The model was asked to honestly report when the uploaded document doesn't actually read
    like a resume (see app/prompts/resume.py's system prompt) — a certificate, transcript, cover
    letter, or other mis-upload should never silently round-trip a half-fabricated extraction
    back into SessionSetupForm's fields. Distinct from a validation failure: the model answered
    correctly and honestly, so this doesn't go through the retry-on-invalid-shape path at all."""
    if not extraction.is_resume:
        raise ApiError(
            "resume_content_not_recognized",
            "We couldn't find resume information in that file — no work experience, skills, or "
            "education. Please upload your actual resume instead.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    return extraction


async def extract_resume_data(resume_text: str) -> ResumeExtraction:
    """Same one-retry-on-validation-failure shape as generate_feedback above, for the much
    smaller job of pulling a background summary/skills/years-of-experience out of resume text —
    see app/prompts/resume.py for the injection-defense framing. `resume_text` is untrusted,
    candidate-supplied content, same as a transcript is."""
    messages = build_resume_messages(resume_text)

    raw = await _complete(messages, max_tokens=_MAX_RESUME_COMPLETION_TOKENS)
    try:
        return _reject_if_not_resume(ResumeExtraction.model_validate_json(raw))
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
            return _reject_if_not_resume(ResumeExtraction.model_validate_json(raw_retry))
        except ValidationError as second_error:
            raise ApiError(
                "llm_failed",
                "The model could not extract data from that resume.",
                status_code=status.HTTP_502_BAD_GATEWAY,
            ) from second_error
