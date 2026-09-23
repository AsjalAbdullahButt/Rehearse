from fastapi import status
from groq import APIStatusError, AsyncGroq
from groq.types.chat import ChatCompletionMessageParam
from pydantic import ValidationError

from app.core.config import get_settings
from app.core.errors import ApiError
from app.prompts.feedback import build_messages
from app.schemas.feedback import LLMFeedback

_TEMPERATURE = 0.3


def _client() -> AsyncGroq:
    settings = get_settings()
    return AsyncGroq(api_key=settings.groq_api_key)


async def _complete(messages: list[ChatCompletionMessageParam]) -> str:
    settings = get_settings()
    try:
        response = await _client().chat.completions.create(
            model=settings.groq_llm_model,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=_TEMPERATURE,
        )
    except APIStatusError as exc:
        raise ApiError(
            "llm_failed",
            "The feedback model is unavailable.",
            status_code=status.HTTP_502_BAD_GATEWAY,
        ) from exc

    content = response.choices[0].message.content
    if not content:
        raise ApiError(
            "llm_failed",
            "The model returned an empty response.",
            status_code=status.HTTP_502_BAD_GATEWAY,
        )
    return content


async def generate_feedback(*, role: str, question_text: str, transcript: str) -> LLMFeedback:
    """Calls the LLM once; on a validation failure (malformed JSON or a shape that doesn't
    match LLMFeedback) retries exactly once with the validation error fed back so the model
    can correct itself. A second failure is a 502 — feedback quality matters more than always
    returning something, and the LLM never sees or emits filler/WPM/pause numbers here."""
    messages = build_messages(role=role, question_text=question_text, transcript=transcript)

    raw = await _complete(messages)
    try:
        return LLMFeedback.model_validate_json(raw)
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
        raw_retry = await _complete(retry_messages)
        try:
            return LLMFeedback.model_validate_json(raw_retry)
        except ValidationError as second_error:
            raise ApiError(
                "llm_failed",
                "The model could not produce valid feedback.",
                status_code=status.HTTP_502_BAD_GATEWAY,
            ) from second_error
