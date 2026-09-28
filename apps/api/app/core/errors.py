import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.request_context import get_request_id

logger = logging.getLogger("rehearse.api")


class ApiError(Exception):
    """An application error with a stable machine-readable code and user-safe message."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        headers: dict[str, str] | None = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.headers = headers
        super().__init__(message)


def _error_response(
    code: str, message: str, status_code: int, headers: dict[str, str] | None = None
) -> JSONResponse:
    # request_id lets a user-reported failure be traced back to this exact request's server-side
    # log lines (see app/core/request_context.py) without needing to log the request itself.
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "request_id": get_request_id()}},
        headers=headers,
    )


_VALUE_ERROR_PREFIX = "Value error, "
"""Pydantic prefixes a custom field_validator's raised ValueError with this boilerplate — our
own validators (e.g. schemas/auth.py's common-password check) already write a complete,
user-facing sentence, so this is stripped rather than shown verbatim."""


def _first_validation_message(exc: RequestValidationError) -> str:
    """Surfaces the first field-level validation error as a short, human-readable message
    (e.g. "password: String should have at least 15 characters") instead of one blanket
    "The request could not be validated." for every kind of bad input — a client (the sign-in
    form, session setup, settings) can otherwise only ever show that one generic sentence,
    leaving the user with no idea what to actually fix. Pydantic's error messages here (length/
    format/enum-membership/range) never include secrets or internals — they describe the shape
    of the input the request itself already contains — so this is a normal, expected amount of
    detail for a validation error response, not an information disclosure."""
    errors = exc.errors()
    if not errors:
        return "The request could not be validated."

    first = errors[0]
    # Drop the leading "body"/"query"/"header" location segment — it's implementation detail,
    # not something a form field is labeled with — but keep everything after it (nested paths
    # like "skills.0" still read fine).
    field = ".".join(str(part) for part in first["loc"][1:])
    message = str(first["msg"])
    if message.startswith(_VALUE_ERROR_PREFIX):
        message = message[len(_VALUE_ERROR_PREFIX) :]
    return f"{field}: {message}" if field else message


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
        return _error_response(exc.code, exc.message, exc.status_code, exc.headers)

    @app.exception_handler(StarletteHTTPException)
    async def _http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _error_response("http_error", exc.detail, exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        return _error_response(
            "validation_error",
            _first_validation_message(exc),
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled exception", exc_info=exc)
        return _error_response(
            "internal_error", "An unexpected error occurred.", status.HTTP_500_INTERNAL_SERVER_ERROR
        )
