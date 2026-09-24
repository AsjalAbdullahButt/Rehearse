from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

_settings = get_settings()

# Sized for Vercel's serverless functions, not a long-running server: each invocation is a
# fresh (or briefly-reused) process, so a handful of connections per warm instance is plenty —
# a pool sized for a persistent server (SQLAlchemy's default 5+10) would let many concurrent
# invocations collectively exhaust MySQL's max_connections (see AGENTS.md's scaling note).
# `pool_recycle` guards against a warm instance holding a connection across a managed MySQL
# host's idle-connection timeout (Aiven's free tier recycles well under an hour); `pool_pre_ping`
# already covers the same failure mode with a lightweight check-before-use, so the two overlap
# deliberately rather than relying on either alone.
_engine_kwargs: dict[str, object] = {"pool_pre_ping": True}
if _settings.database_url.get_secret_value().startswith("mysql"):
    _engine_kwargs.update(pool_size=3, max_overflow=2, pool_recycle=300)

engine = create_async_engine(_settings.database_url.get_secret_value(), **_engine_kwargs)

async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        yield session
