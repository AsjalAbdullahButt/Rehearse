import json

from fastapi import status
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import ApiError


def _declared_content_length(scope: Scope) -> int | None:
    for name, value in scope.get("headers", []):
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None


async def _send_413(send: Send) -> None:
    body = json.dumps(
        {
            "error": {
                "code": "payload_too_large",
                "message": "Request body exceeds the maximum allowed size.",
            }
        }
    ).encode("utf-8")
    await send(
        {
            "type": "http.response.start",
            "status": status.HTTP_413_CONTENT_TOO_LARGE,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send({"type": "http.response.body", "body": body})


class MaxBodySizeMiddleware:
    """Pure-ASGI middleware that rejects an oversized request body before Starlette's own
    multipart/form parser ever gets a chance to buffer it into memory (the app-level 4MB check
    in app/routers/answers.py's `_read_capped` only runs *after* that parsing has already
    happened).

    Two layers, since a client controls both:
    - A declared `Content-Length` over the limit is rejected immediately via a hand-built ASGI
      response, without ever touching `self.app` — the common, honest-client case, and cheap.
    - The actual byte stream is also counted as it flows through a wrapped `receive`, so a
      request that omits `Content-Length` (chunked transfer) or lies about it is still cut off
      once real bytes exceed the cap. Raising `ApiError` here works even though this middleware
      sits outside FastAPI's `ExceptionMiddleware`: `receive` is *called* from deep inside the
      route handler's own await chain (e.g. `request.form()`), so the exception unwinds back up
      through that same chain — including through `ExceptionMiddleware`'s try/except — before it
      ever reaches this middleware's own frame. Exception routing follows the call stack, not
      middleware registration order.
    """

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = _declared_content_length(scope)
        if declared is not None and declared > self.max_bytes:
            await _send_413(send)
            return

        seen = 0

        async def limited_receive() -> Message:
            nonlocal seen
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body") or b"")
                if seen > self.max_bytes:
                    raise ApiError(
                        "payload_too_large",
                        "Request body exceeds the maximum allowed size.",
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    )
            return message

        await self.app(scope, limited_receive, send)
