"""Regression coverage for the durable, cross-instance rate limiter (app/core/rate_limit.py).
The old slowapi limiter was in-memory per-process, so it silently reset on every serverless
cold start; the DB-backed replacement should hold the limit even across what would have been
two separate, independently-initialized instances."""

from datetime import timedelta
from pathlib import Path

import pytest
from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core import rate_limit as rate_limit_module
from app.core.config import Settings
from app.core.errors import ApiError
from app.core.rate_limit import (
    INTERNAL_CLIENT_IP_HEADER,
    INTERNAL_PROXY_SECRET_HEADER,
    client_ip_key,
    enforce_rate_limit,
)
from app.models import Base
from app.models.base import utcnow
from app.models.rate_limit_hit import RateLimitHit
from app.services import repo


def _fake_request() -> Request:
    return Request({"type": "http", "client": ("127.0.0.1", 12345), "headers": []})


def _request_with_headers(
    headers: dict[str, str], *, connection_ip: str = "203.0.113.9"
) -> Request:
    encoded = [(key.lower().encode(), value.encode()) for key, value in headers.items()]
    return Request({"type": "http", "client": (connection_ip, 12345), "headers": encoded})


def _use_settings_with_secret(monkeypatch: pytest.MonkeyPatch, secret: str | None) -> None:
    if secret is None:
        monkeypatch.delenv("INTERNAL_PROXY_SECRET", raising=False)
    else:
        monkeypatch.setenv("INTERNAL_PROXY_SECRET", secret)
    settings = Settings()  # pyright: ignore[reportCallIssue]
    monkeypatch.setattr(rate_limit_module, "get_settings", lambda: settings)


def test_client_ip_key_uses_the_raw_connection_ip_when_no_secret_is_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_settings_with_secret(monkeypatch, None)
    # Even a caller that sends the exact forwarded-IP header gets ignored — the mechanism is
    # simply off, not "trust anything that looks right".
    request = _request_with_headers(
        {INTERNAL_CLIENT_IP_HEADER: "1.2.3.4"}, connection_ip="203.0.113.9"
    )

    assert client_ip_key(request) == "ip:203.0.113.9"


def test_client_ip_key_trusts_the_forwarded_ip_with_a_matching_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_settings_with_secret(monkeypatch, "the-shared-bff-secret")
    request = _request_with_headers(
        {
            INTERNAL_PROXY_SECRET_HEADER: "the-shared-bff-secret",
            INTERNAL_CLIENT_IP_HEADER: "198.51.100.42",
        },
        connection_ip="203.0.113.9",
    )

    assert client_ip_key(request) == "ip:198.51.100.42"


def test_client_ip_key_falls_back_to_the_connection_ip_on_a_wrong_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Proves a public caller can't spoof its way past the raw connection IP just by copying the
    # header names — it also needs the secret, which only the BFF has.
    _use_settings_with_secret(monkeypatch, "the-shared-bff-secret")
    request = _request_with_headers(
        {
            INTERNAL_PROXY_SECRET_HEADER: "a-guessed-wrong-secret",
            INTERNAL_CLIENT_IP_HEADER: "198.51.100.42",
        },
        connection_ip="203.0.113.9",
    )

    assert client_ip_key(request) == "ip:203.0.113.9"


def test_client_ip_key_falls_back_to_the_connection_ip_when_secret_matches_but_ip_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _use_settings_with_secret(monkeypatch, "the-shared-bff-secret")
    request = _request_with_headers(
        {INTERNAL_PROXY_SECRET_HEADER: "the-shared-bff-secret"}, connection_ip="203.0.113.9"
    )

    assert client_ip_key(request) == "ip:203.0.113.9"


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


async def test_enforce_rate_limit_allows_exactly_the_limit_and_rejects_the_next(
    db_session: AsyncSession,
) -> None:
    for _ in range(5):
        await enforce_rate_limit(
            _fake_request(), db_session, scope="register", limit=5, window_seconds=60
        )

    with pytest.raises(ApiError) as exc_info:
        await enforce_rate_limit(
            _fake_request(), db_session, scope="register", limit=5, window_seconds=60
        )

    assert exc_info.value.status_code == 429


async def test_enforce_rate_limit_keys_are_independent(db_session: AsyncSession) -> None:
    def _request_from(ip: str) -> Request:
        return Request({"type": "http", "client": (ip, 12345), "headers": []})

    for _ in range(5):
        await enforce_rate_limit(
            _request_from("10.0.0.1"), db_session, scope="register", limit=5, window_seconds=60
        )

    with pytest.raises(ApiError):
        await enforce_rate_limit(
            _request_from("10.0.0.1"), db_session, scope="register", limit=5, window_seconds=60
        )

    # A different key (different IP) has its own, untouched budget.
    await enforce_rate_limit(
        _request_from("10.0.0.2"), db_session, scope="register", limit=5, window_seconds=60
    )

    # ...and a different scope for the *same* IP is independent too.
    await enforce_rate_limit(
        _request_from("10.0.0.1"), db_session, scope="login", limit=5, window_seconds=60
    )


async def test_record_rate_limit_hit_eventually_cleans_up_a_key_that_never_recurs(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A row for a key that's never hit again would otherwise never be cleaned up by the
    # per-key delete in record_rate_limit_hit, since that only runs when *that* key recurs.
    stale_cutoff = utcnow() - timedelta(seconds=repo.GLOBAL_RATE_LIMIT_RETENTION_S + 1)
    db_session.add(RateLimitHit(key="ip:one-time-visitor", created_at=stale_cutoff))
    await db_session.commit()

    # Force the probabilistic global sweep to run on this call, from an unrelated key.
    monkeypatch.setattr(repo.random, "random", lambda: 0.0)
    await repo.record_rate_limit_hit(db_session, key="ip:someone-else", window_seconds=60)

    remaining = await db_session.execute(
        select(func.count())
        .select_from(RateLimitHit)
        .where(RateLimitHit.key == "ip:one-time-visitor")
    )
    assert remaining.scalar_one() == 0


async def test_record_rate_limit_hit_does_not_delete_fresh_rows_during_a_global_sweep(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(repo.random, "random", lambda: 0.0)

    count = await repo.record_rate_limit_hit(db_session, key="ip:someone", window_seconds=60)

    assert count == 1
