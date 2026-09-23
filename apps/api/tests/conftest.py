import os
from collections.abc import AsyncIterator, Callable, Iterator
from typing import Any

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-only-secret-do-not-use-in-production")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """A fresh in-memory SQLite DB per test. Models use dialect-agnostic SQLAlchemy types
    (generic JSON/Enum/DECIMAL, not MySQL-native ones) specifically so this works; the real
    MySQL-specific surface (utf8mb4, CHECK enforcement) is exercised by `alembic upgrade head`
    against a real MySQL service container in CI, not here."""
    from app.models import Base

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest.fixture
def client(db_session: AsyncSession) -> Iterator[TestClient]:
    from app.db import get_db
    from app.main import create_app

    app = create_app()

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def register_user(client: TestClient) -> Callable[..., dict[str, Any]]:
    """Registers a user through the real endpoint (not a DB shortcut) and returns the token
    pair + user body, so tests exercise the same path a real client would."""

    def _register(
        email: str = "user@example.com", password: str = "correct-horse-battery-staple"
    ) -> dict[str, Any]:
        response = client.post("/v1/auth/register", json={"email": email, "password": password})
        assert response.status_code == 201
        body: dict[str, Any] = response.json()
        return body

    return _register
