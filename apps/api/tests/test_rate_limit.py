"""Regression coverage for the durable, cross-instance rate limiter (app/core/rate_limit.py).
The old slowapi limiter was in-memory per-process, so it silently reset on every serverless
cold start; the DB-backed replacement should hold the limit even across what would have been
two separate, independently-initialized instances."""

from pathlib import Path

import pytest
from fastapi import Request
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.errors import ApiError
from app.core.rate_limit import enforce_rate_limit
from app.models import Base


def _fake_request() -> Request:
    return Request({"type": "http", "client": ("127.0.0.1", 12345), "headers": []})


async def _fresh_instance(db_url: str) -> tuple[AsyncSession, AsyncEngine]:
    """Stands in for a brand-new serverless cold start: its own engine and session, with no
    shared Python object between it and any other "instance" — the only thing connecting them
    is the same underlying database."""
    engine = create_async_engine(db_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session = async_sessionmaker(engine, expire_on_commit=False)()
    return session, engine


async def test_rate_limit_holds_across_independently_initialized_instances(
    tmp_path: Path,
) -> None:
    db_url = f"sqlite+aiosqlite:///{tmp_path / 'rate_limit.db'}"

    session_a, engine_a = await _fresh_instance(db_url)
    session_b, engine_b = await _fresh_instance(db_url)

    try:
        for _ in range(5):
            await enforce_rate_limit(
                _fake_request(), session_a, scope="register", limit=5, window_seconds=60
            )

        # "Instance B" has never seen instance A's requests in memory — if the limit were still
        # process-local, this would succeed. It should instead see the same 5 hits already
        # recorded in the shared database and reject the 6th.
        with pytest.raises(ApiError) as exc_info:
            await enforce_rate_limit(
                _fake_request(), session_b, scope="register", limit=5, window_seconds=60
            )

        assert exc_info.value.status_code == 429
        assert exc_info.value.code == "rate_limited"
        assert exc_info.value.headers == {"Retry-After": "60"}
    finally:
        await session_a.close()
        await session_b.close()
        await engine_a.dispose()
        await engine_b.dispose()
