"""Unit coverage for MaxBodySizeMiddleware (app/core/middleware.py), exercised directly at the
ASGI level rather than through TestClient/httpx, since httpx doesn't give an easy way to send a
body that lies about its own Content-Length or to drip-feed chunks without one."""

from collections.abc import Awaitable, Callable
from typing import Any

import pytest
from starlette.types import Message, Scope

from app.core.errors import ApiError
from app.core.middleware import MaxBodySizeMiddleware

MAX_BYTES = 1024


def _http_scope(*, content_length: int | None) -> Scope:
    headers: list[tuple[bytes, bytes]] = []
    if content_length is not None:
        headers.append((b"content-length", str(content_length).encode()))
    return {"type": "http", "headers": headers}


def _receive_once(body: bytes) -> Callable[[], Awaitable[Message]]:
    sent = False

    async def receive() -> Message:
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return receive


def _chunked_receive(chunks: list[bytes]) -> Callable[[], Awaitable[Message]]:
    remaining = list(chunks)

    async def receive() -> Message:
        if not remaining:
            return {"type": "http.disconnect"}
        chunk = remaining.pop(0)
        return {"type": "http.request", "body": chunk, "more_body": bool(remaining)}

    return receive


async def _collect_send() -> tuple[Callable[[Message], Awaitable[None]], list[Message]]:
    messages: list[Message] = []

    async def send(message: Message) -> None:
        messages.append(message)

    return send, messages


async def test_rejects_a_declared_content_length_over_the_limit_without_calling_the_app() -> None:
    async def app_should_not_run(scope: Scope, receive: Any, send: Any) -> None:
        raise AssertionError("app must not run when Content-Length already exceeds the cap")

    middleware = MaxBodySizeMiddleware(app_should_not_run, max_bytes=MAX_BYTES)
    send, messages = await _collect_send()

    await middleware(_http_scope(content_length=MAX_BYTES + 1), _receive_once(b""), send)

    assert messages[0]["type"] == "http.response.start"
    assert messages[0]["status"] == 413


async def test_allows_a_declared_content_length_at_the_limit() -> None:
    async def app(scope: Scope, receive: Any, send: Any) -> None:
        await receive()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = MaxBodySizeMiddleware(app, max_bytes=MAX_BYTES)
    send, messages = await _collect_send()

    await middleware(_http_scope(content_length=MAX_BYTES), _receive_once(b"x" * MAX_BYTES), send)

    assert messages[0]["status"] == 200


async def test_cuts_off_a_chunked_stream_that_exceeds_the_limit_with_no_declared_length() -> None:
    async def app(scope: Scope, receive: Any, send: Any) -> None:
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return

    middleware = MaxBodySizeMiddleware(app, max_bytes=MAX_BYTES)
    send, _messages = await _collect_send()
    chunks = [b"x" * (MAX_BYTES // 2 + 1), b"y" * (MAX_BYTES // 2 + 1)]

    with pytest.raises(ApiError) as exc_info:
        await middleware(_http_scope(content_length=None), _chunked_receive(chunks), send)

    assert exc_info.value.status_code == 413
    assert exc_info.value.code == "payload_too_large"


async def test_allows_a_chunked_stream_under_the_limit_with_no_declared_length() -> None:
    async def app(scope: Scope, receive: Any, send: Any) -> None:
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                await send({"type": "http.response.start", "status": 200, "headers": []})
                return

    middleware = MaxBodySizeMiddleware(app, max_bytes=MAX_BYTES)
    send, messages = await _collect_send()
    chunks = [b"x" * (MAX_BYTES // 4), b"y" * (MAX_BYTES // 4)]

    await middleware(_http_scope(content_length=None), _chunked_receive(chunks), send)

    assert messages[0]["status"] == 200


async def test_passes_non_http_scopes_through_untouched() -> None:
    seen: dict[str, Any] = {}

    async def app(scope: Scope, receive: Any, send: Any) -> None:
        seen["receive"] = receive
        seen["send"] = send

    middleware = MaxBodySizeMiddleware(app, max_bytes=MAX_BYTES)
    receive = _receive_once(b"")
    send, _messages = await _collect_send()

    await middleware({"type": "lifespan"}, receive, send)

    # The receive passed to the wrapped app must be the *original* callable, not the
    # byte-counting wrapper — a lifespan/websocket scope has no HTTP body to bound.
    assert seen["receive"] is receive
    assert seen["send"] is send
