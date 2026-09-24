"""Shared retry/timeout policy for both Groq call sites (stt.py, llm.py) — one 5xx/429 is
worth a single retry, anything else (bad request, auth) would just fail the same way again."""

from fastapi import status
from groq import APIStatusError

REQUEST_TIMEOUT_S = 30.0


def is_retryable(exc: APIStatusError) -> bool:
    return exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS or exc.status_code >= 500
