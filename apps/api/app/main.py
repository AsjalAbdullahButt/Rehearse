from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.limits import MAX_REQUEST_BODY_BYTES
from app.core.logging import configure_logging
from app.core.middleware import MaxBodySizeMiddleware, RequestIdMiddleware
from app.routers import answers, auth, health, profile, progress, questions, resume, sessions


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()

    # Outside production, docs/redoc/openapi stay on (local dev + staging convenience). In
    # production they're off unless ENABLE_API_DOCS is explicitly set — see
    # Settings.docs_enabled's docstring.
    docs_url = "/docs" if settings.docs_enabled else None
    redoc_url = "/redoc" if settings.docs_enabled else None
    openapi_url = "/openapi.json" if settings.docs_enabled else None

    app = FastAPI(
        title="Rehearse API",
        version="0.1.0",
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type", "X-Request-Id"],
        expose_headers=["X-Request-Id"],
    )
    # Added after CORS so it wraps outside it (Starlette's user_middleware runs
    # last-added-outermost) — an oversized body is rejected before any other processing at all.
    app.add_middleware(MaxBodySizeMiddleware, max_bytes=MAX_REQUEST_BODY_BYTES)
    # Outermost of all: every request (including one MaxBodySizeMiddleware rejects) gets a
    # correlation ID before anything else runs.
    app.add_middleware(RequestIdMiddleware)

    register_exception_handlers(app)

    app.include_router(health.router, prefix="/v1", tags=["health"])
    app.include_router(auth.router, prefix="/v1", tags=["auth"])
    app.include_router(questions.router, prefix="/v1", tags=["questions"])
    app.include_router(sessions.router, prefix="/v1", tags=["sessions"])
    app.include_router(answers.router, prefix="/v1", tags=["answers"])
    app.include_router(progress.router, prefix="/v1", tags=["progress"])
    app.include_router(profile.router, prefix="/v1", tags=["profile"])
    app.include_router(resume.router, prefix="/v1", tags=["resume"])

    return app


app = create_app()
