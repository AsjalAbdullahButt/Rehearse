from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.limits import MAX_REQUEST_BODY_BYTES
from app.core.logging import configure_logging
from app.core.middleware import MaxBodySizeMiddleware
from app.routers import answers, auth, health, profile, progress, questions, sessions


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()

    app = FastAPI(title="Rehearse API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type"],
    )
    # Added after CORS so it wraps outside it (Starlette's user_middleware runs
    # last-added-outermost) — an oversized body is rejected before any other processing at all.
    app.add_middleware(MaxBodySizeMiddleware, max_bytes=MAX_REQUEST_BODY_BYTES)

    register_exception_handlers(app)

    app.include_router(health.router, prefix="/v1", tags=["health"])
    app.include_router(auth.router, prefix="/v1", tags=["auth"])
    app.include_router(questions.router, prefix="/v1", tags=["questions"])
    app.include_router(sessions.router, prefix="/v1", tags=["sessions"])
    app.include_router(answers.router, prefix="/v1", tags=["answers"])
    app.include_router(progress.router, prefix="/v1", tags=["progress"])
    app.include_router(profile.router, prefix="/v1", tags=["profile"])

    return app


app = create_app()
