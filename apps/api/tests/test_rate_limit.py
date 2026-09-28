"""Regression coverage for the durable, cross-instance rate limiter (app/core/rate_limit.py).
The old slowapi limiter was in-memory per-process, so it silently reset on every serverless
cold start; the DB-backed replacement should hold the limit even across what would have been
two separate, independently-initialized instances."""

import asyncio
from datetime import timedelta
from pathlib import Path

import jwt
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
from app.core.auth import issue_access_token, issue_refresh_token
from app.core.config import Settings, get_settings
from app.core.errors import ApiError
from app.core.rate_limit import (
    INTERNAL_CLIENT_IP_HEADER,
    INTERNAL_PROXY_SECRET_HEADER,
    client_ip_key,
    enforce_rate_limit,
    user_or_ip_key,
)
from app.models import Base
from app.models.base import utcnow
from app.models.rate_limit_counter import RateLimitCounter
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
        # Fixed-window semantics (see RateLimitCounter's docstring): Retry-After is "seconds
        # until this window resets", not a fixed echo of window_seconds — it depends on exactly
        # when in the window the request landed, so this only asserts the bound rather than an
        # exact value that would make the test flaky.
        assert exc_info.value.headers is not None
        retry_after = int(exc_info.value.headers["Retry-After"])
        assert 1 <= retry_after <= 60
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
    # A bucket for a key that's never hit again would otherwise sit in the table forever — this
    # relies purely on the probabilistic global sweep, not any per-key cleanup.
    stale_cutoff = utcnow() - timedelta(seconds=repo.GLOBAL_RATE_LIMIT_RETENTION_S + 1)
    db_session.add(
        RateLimitCounter(id="stale-1", key="ip:one-time-visitor", window_start=stale_cutoff, hits=1)
    )
    await db_session.commit()

    # Force the probabilistic global sweep to run on this call, from an unrelated key.
    monkeypatch.setattr(repo.random, "random", lambda: 0.0)
    await repo.record_rate_limit_hit(db_session, key="ip:someone-else", window_seconds=60)

    remaining = await db_session.execute(
        select(func.count())
        .select_from(RateLimitCounter)
        .where(RateLimitCounter.key == "ip:one-time-visitor")
    )
    assert remaining.scalar_one() == 0


async def test_record_rate_limit_hit_does_not_delete_fresh_rows_during_a_global_sweep(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(repo.random, "random", lambda: 0.0)

    count, retry_after_s = await repo.record_rate_limit_hit(
        db_session, key="ip:someone", window_seconds=60
    )

    assert count == 1
    assert 1 <= retry_after_s <= 60

    remaining = await db_session.execute(
        select(func.count())
        .select_from(RateLimitCounter)
        .where(RateLimitCounter.key == "ip:someone")
    )
    assert remaining.scalar_one() == 1


async def test_record_rate_limit_hit_increments_the_same_bucket_atomically_across_connections(
    tmp_path: Path,
) -> None:
    """Direct regression for the concurrency-safety fix: many requests racing against the same
    key within the same window, from genuinely separate connections (not one shared
    AsyncSession — SQLAlchemy sessions aren't safe for concurrent use, so this uses N independent
    engine/session pairs against the same on-disk SQLite file, the same shape as
    test_rate_limit_holds_across_independently_initialized_instances above), must all land in
    the same fixed-window bucket with every hit counted — none lost to the earlier design's
    unlocked INSERT-then-SELECT-COUNT race. A generous busy-timeout is set so SQLite's
    coarse whole-database write lock makes a losing connection wait rather than raise
    "database is locked" — the property under test is "no lost update", not "no serialization
    delay"."""
    db_url = f"sqlite+aiosqlite:///{tmp_path / 'rate_limit_concurrency.db'}"
    concurrency = 20

    engines: list[AsyncEngine] = []
    sessions: list[AsyncSession] = []
    for _ in range(concurrency):
        engine = create_async_engine(db_url, connect_args={"timeout": 30})
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        engines.append(engine)
        sessions.append(async_sessionmaker(engine, expire_on_commit=False)())

    try:
        results = await asyncio.gather(
            *[
                repo.record_rate_limit_hit(session, key="ip:racer", window_seconds=60)
                for session in sessions
            ]
        )

        counts = sorted(count for count, _ in results)
        # Every one of the concurrent calls must have observed a distinct, consecutive count —
        # duplicates would mean two increments landed on the same "hits" value (a lost update).
        assert counts == list(range(1, concurrency + 1))

        verify_engine = create_async_engine(db_url)
        async with verify_engine.connect() as conn:
            stored = await conn.execute(
                select(RateLimitCounter.hits).where(RateLimitCounter.key == "ip:racer")
            )
            assert stored.scalar_one() == concurrency
        await verify_engine.dispose()
    finally:
        for session in sessions:
            await session.close()
        for engine in engines:
            await engine.dispose()


# ─── user_or_ip_key: reuses core/auth.py's canonical JWT validation ─────────────────────────


def _bearer_request(token: str, *, connection_ip: str = "203.0.113.9") -> Request:
    return _request_with_headers({"Authorization": f"Bearer {token}"}, connection_ip=connection_ip)


def test_user_or_ip_key_maps_a_valid_access_token_to_the_user_bucket() -> None:
    token = issue_access_token("user-42")

    assert user_or_ip_key(_bearer_request(token)) == "user:user-42"


def test_user_or_ip_key_falls_back_to_ip_on_a_bad_signature() -> None:
    token = issue_access_token("user-42")
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")

    assert user_or_ip_key(_bearer_request(tampered)) == "ip:203.0.113.9"


def test_user_or_ip_key_falls_back_to_ip_on_an_expired_token() -> None:
    settings = get_settings()
    expired = jwt.encode(
        {
            "sub": "user-42",
            "type": "access",
            "iat": 0,
            "exp": 1,
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "ver": 1,
        },
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )

    assert user_or_ip_key(_bearer_request(expired)) == "ip:203.0.113.9"


def test_user_or_ip_key_falls_back_to_ip_for_a_refresh_token() -> None:
    # A refresh token is a validly-signed, non-expired token with the right issuer/audience —
    # the only thing wrong with it here is its "type" claim. Proves user_or_ip_key rejects it
    # for that reason specifically, not just "any parse failure", i.e. it can't be used to farm
    # a bigger per-user rate-limit bucket by presenting a refresh token as if it were an access
    # token.
    token = issue_refresh_token("user-42")

    assert user_or_ip_key(_bearer_request(token)) == "ip:203.0.113.9"


def test_user_or_ip_key_falls_back_to_ip_on_wrong_issuer() -> None:
    settings = get_settings()
    now = int(utcnow().timestamp())
    token = jwt.encode(
        {
            "sub": "user-42",
            "type": "access",
            "iat": now,
            "exp": now + 3600,
            "iss": "some-other-issuer",
            "aud": settings.jwt_audience,
            "ver": 1,
        },
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )

    assert user_or_ip_key(_bearer_request(token)) == "ip:203.0.113.9"


def test_user_or_ip_key_falls_back_to_ip_on_wrong_audience() -> None:
    settings = get_settings()
    now = int(utcnow().timestamp())
    token = jwt.encode(
        {
            "sub": "user-42",
            "type": "access",
            "iat": now,
            "exp": now + 3600,
            "iss": settings.jwt_issuer,
            "aud": "some-other-deployment",
            "ver": 1,
        },
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )

    assert user_or_ip_key(_bearer_request(token)) == "ip:203.0.113.9"


def test_user_or_ip_key_falls_back_to_ip_when_no_authorization_header_is_present() -> None:
    assert user_or_ip_key(_fake_request()) == "ip:127.0.0.1"


async def test_enforce_rate_limit_keys_two_users_behind_one_shared_ip_independently(
    db_session: AsyncSession,
) -> None:
    """Two different accounts making requests through the same NAT/office IP must not share one
    rate-limit bucket — each user's access token should route them to their own "user:<id>" key
    regardless of the connection IP they both share."""
    token_a = issue_access_token("user-a")
    token_b = issue_access_token("user-b")

    for _ in range(6):
        await enforce_rate_limit(
            _bearer_request(token_a, connection_ip="198.51.100.5"),
            db_session,
            scope="answers",
            limit=6,
            window_seconds=60,
            key_func=user_or_ip_key,
        )

    # user A is now at their limit...
    with pytest.raises(ApiError):
        await enforce_rate_limit(
            _bearer_request(token_a, connection_ip="198.51.100.5"),
            db_session,
            scope="answers",
            limit=6,
            window_seconds=60,
            key_func=user_or_ip_key,
        )

    # ...but user B, behind the exact same connection IP, has their own untouched budget.
    await enforce_rate_limit(
        _bearer_request(token_b, connection_ip="198.51.100.5"),
        db_session,
        scope="answers",
        limit=6,
        window_seconds=60,
        key_func=user_or_ip_key,
    )
