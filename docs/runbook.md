# Incident runbook

Minimal on-call notes for Rehearse (solo-maintainer MVP, not a 24/7 SLA product). For each
scenario: what to check first, in order, before digging further.

## Reference

- Liveness: `GET /v1/health` — cheap, always `200 {"status":"ok"}` if the process is up.
- Readiness: `GET /v1/health/ready` — runs a real `SELECT 1`; `503` means the process is up but
  can't reach the database.
- Vercel dashboard → each project's **Functions** tab has invocation logs and durations; **Deployments**
  tab has build/runtime errors.
- Error response shape is always `{"error":{"code":..., "message":...}}` — the `code` narrows
  down which check below applies faster than the human-readable `message`.

## API returning 5xx / totally down

1. Hit `GET /v1/health` directly. No response at all (not even a 500) → check Vercel's status
   page and the project's Deployments tab for a failed/rolled-back deploy.
2. `/v1/health` returns `200` but real endpoints 500 → check `/v1/health/ready`. If that's also
   `200`, the DB is fine — check Vercel's function logs for the actual traceback (the client only
   ever sees the generic `internal_error` message; the real exception is logged server-side via
   `core/errors.py`'s unhandled-exception handler).
3. Check for a bad env var: `apps/api/app/core/config.py` fails fast (`Settings()` raises) if a
   required var is missing or malformed — a bad deploy env change shows up as every request
   failing identically, not an intermittent pattern.

## Database unreachable

1. `GET /v1/health/ready` returning `503` is the confirming signal.
2. Check the MySQL host's own status page/dashboard (Aiven, if that's what's provisioned — see
   README's Prerequisites section) for an outage or a paused/suspended free-tier instance.
3. Check `DATABASE_URL` on the API's Vercel project hasn't rotated or expired (managed hosts
   sometimes rotate credentials on plan changes).
4. If the host is up but connections are being refused/exhausted: see `app/db.py`'s pool-sizing
   comment — `pool_size=3, max_overflow=2` per warm instance is deliberately small for a
   serverless deployment, but many concurrent cold starts can still add up against the host's
   `max_connections`. A connection pooler in front of MySQL (ProxySQL, or the host's built-in
   one) is the documented next step if this becomes a real, recurring constraint — not something
   to build reactively mid-incident.
5. **Backups/RPO — verify, don't assume:** confirm the MySQL host has automated backups enabled
   and note its actual recovery point objective (how much data could be lost between the last
   backup and an incident). This is a host dashboard setting, not application code — it hasn't
   been verified as part of this hardening pass and should be checked directly on whichever host
   is provisioned before this app holds any data you'd be upset to lose.

## Groq API down or degraded (STT/LLM failures)

1. Both `services/stt.py` and `services/llm.py` already time out at 30s and retry exactly once
   on a 429/5xx (see `services/groq_retry.py`) — a real Groq outage surfaces to the user as a
   `502 {"code":"stt_failed"}` or `502 {"code":"llm_failed"}` on `POST /v1/answers`, not a hang.
   The failure is isolated to that one request; it doesn't take down the rest of the API (no
   shared state is touched by the STT/LLM call path).
2. Check [Groq's status page] for a known outage before assuming it's this app's bug.
3. **Known timeout-budget risk, not yet hardened further:** worst case, a single answer
   submission can chain STT (30s) → STT retry (30s) → LLM (30s) → LLM retry (30s) → LLM's
   *separate* validation-failure retry (another 30s+30s) — i.e. it's possible in a bad-case
   cascade to approach or exceed even the 60s `maxDuration` now set in `apps/api/vercel.json`
   (Vercel Hobby's maximum; it was previously unset, which defaults to a much shorter limit).
   If that happens, Vercel kills the function directly — the client sees a network-level failure,
   not a clean `502`, and (per the interview flow's "Retry upload" button, added in this
   hardening pass) the user's recording is preserved client-side and resubmittable. There is no
   queue/background-job architecture for this — that's an accepted, explicitly-named MVP
   limitation (see §B.4/§H of the hardening pass), not a silent gap. If Groq outages become
   frequent enough for this to matter in practice, the fix is moving answer submission to an
   async job + polling pattern, not raising timeouts further.
4. If Groq is fine but everything's still failing: check `GROQ_API_KEY` hasn't expired/rotated.

## Auth broken (logins failing, tokens rejected)

1. `{"code":"invalid_credentials"}` on a login that should work → check `JWT_SECRET` hasn't
   changed on the API's Vercel project (a rotated secret invalidates every previously-issued
   token instantly — every logged-in user gets logged out at once, not just new logins failing).
2. `{"code":"token_invalid"}`/`{"code":"token_expired"}` on refresh for a session that should
   still be valid → check server clock skew is implausible (JWT `exp` is checked with no leeway
   server-side; client-side proactive refresh already covers normal skew — see
   `lib/auth/session.ts`'s `EXPIRY_SKEW_S`).
3. Every request 401ing including fresh registrations → check `argon2-cffi`/`pyjwt` didn't fail
   to import at cold start (would show as a 500 at startup in Vercel's function logs, not a
   clean auth error).
4. A specific user locked out and can't recover: there is currently no password-reset flow (a
   known, named gap — see §8 of the 2026-09-28 security-hardening pass below). The only recovery
   path today is a direct DB update of `users.password_hash` via `hash_password()`.
5. Suspected compromised account: `POST /v1/auth/logout-all` revokes every refresh token for a
   user *and* bumps `users.token_version` (added in the 2026-09-28 pass), which immediately
   rejects every access token already issued to that user too — not just new refreshes. Use this
   over the single-token `/v1/auth/logout` when the concern is "get this account off every
   device right now," not just "the next refresh will fail."
6. `{"code":"session_invalidated"}` on a request that used to work → expected, not a bug: the
   user's `token_version` was bumped (password change or logout-all) since that access token was
   issued. The client should silently redirect to sign-in, the same as any other 401.

## Rate limiting — durable but not a real distributed limiter

`app/core/rate_limit.py` / `app/services/repo.py`'s `record_rate_limit_hit` counts hits in a
MySQL table (`rate_limit_counters`), using an atomically-upserted **fixed window** per
`(scope+key, window_start)` bucket — the increment itself is race-free (proven by
`tests/test_rate_limit.py`'s concurrency test), but a fixed window can still let a burst
straddling a window boundary briefly exceed the configured limit by up to ~2x. This is a
documented, accepted tradeoff for a free-tier MySQL-only deployment, not a true
Redis/Upstash-backed distributed sliding-window limiter. If abuse patterns in production traffic
ever actually exploit the boundary-burst characteristic, the fix is adding a Redis/Upstash
instance and porting `record_rate_limit_hit` to an atomic `INCR`+`EXPIRE`, not tightening the
MySQL-only implementation further.

## Production config — startup will refuse to boot on a real misconfiguration

Set `ENVIRONMENT=production` on every real deployment (defaults to `development`, which skips
the checks below — see `app/core/config.py`'s `Settings._enforce_production_requirements`).
With `ENVIRONMENT=production`:

- `INTERNAL_PROXY_SECRET` becomes **required** (startup raises `ValidationError` without it) —
  it's what lets rate limiting trust the Next.js BFF's forwarded client IP; see
  `app/core/rate_limit.py`.
- `/docs`, `/redoc`, `/openapi.json` are disabled unless `ENABLE_API_DOCS=true` is also set.
- The MySQL connection is **encrypted and certificate-verified** (`DATABASE_TLS` defaults to on in
  production; startup raises `ValidationError` if it is explicitly set false). If the managed host
  signs with its own certificate authority (Aiven does), download its CA bundle and set
  `DATABASE_SSL_CA` to the file's path — a wrong path fails at boot rather than silently skipping
  verification. Local development and staging default to unencrypted so a Docker MySQL works as-is.
- `JWT_ALGORITHM` is validated against an HMAC-only allow-list (`HS256`/`HS384`/`HS512`)
  regardless of environment — this project signs and verifies with one shared secret, never a
  keypair.

If a production deploy fails to start with a `ValidationError` mentioning one of the above,
that's this startup check working as intended, not a bug — set the missing/invalid env var.

[Groq's status page]: https://status.groq.com
