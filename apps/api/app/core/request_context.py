"""Per-request correlation ID, threaded through logging and error responses.

Set once by `RequestIdMiddleware` (see `app/core/middleware.py`) at the start of each request and
read from anywhere else in that same request's call stack via a `ContextVar` — never passed as an
explicit argument through every function in between. Holds only an opaque ID, never request
content (no transcripts, credentials, job descriptions, etc. belong here).
"""

from contextvars import ContextVar, Token

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def get_request_id() -> str | None:
    return _request_id.get()


def set_request_id(value: str) -> Token[str | None]:
    return _request_id.set(value)


def reset_request_id(token: Token[str | None]) -> None:
    _request_id.reset(token)
