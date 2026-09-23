# AGENTS.md — Rehearse

Conventions summary for anyone (human or agent) working in this repo. Keep this updated as
phases land.

## What this is

Rehearse is an AI mock interview coach. Pick a role, answer a spoken question into the mic, get
transcription, filler/pace/pause metrics (computed in code, never guessed by an LLM), STAR and
clarity scoring, a stronger sample answer, and progress tracking across sessions. Portfolio-grade
2-week MVP — polish and correctness over feature count.

## Stack

- **Monorepo:** pnpm workspaces (`apps/web`, `apps/api`)
- **Web:** Next.js (App Router, RSC) + React 19 + TypeScript strict, Tailwind CSS v4
  (CSS-first `@theme` tokens in `globals.css`), `motion` + `lenis`, `next-themes`
- **API:** FastAPI on Vercel Python functions, managed with `uv`, Python 3.12, fully type-hinted
- **DB:** MySQL 8 (utf8mb4) via SQLAlchemy 2.x (async, `aiomysql`), migrations via Alembic
- **Auth:** FastAPI-native JWT (short-lived access token + rotating refresh token, `argon2`
  password hashing). The web app stores the access/refresh tokens in httpOnly cookies set by
  Next.js route handlers (`apps/web/src/app/api/auth/*`) that proxy to the API — never
  `localStorage`. Email + password only for v1; Google OAuth is a post-Phase-6 stretch goal (see
  Phase 2.5 report in git history for the tradeoff).
- **Authorization:** no RLS equivalent on MySQL — every session/answer read or write is scoped to
  `user_id` explicitly in `apps/api/app/services/repo.py`. Treat a missing `user_id` filter there
  as a cross-user data leak, not a style nit.
- **STT/LLM:** Groq (`whisper-large-v3-turbo`, Llama via JSON mode + Pydantic validation)
- **Free tiers only:** Vercel Hobby, Groq free API, [Aiven free-tier MySQL](https://aiven.io/free-mysql-database)
  (or local Docker MySQL 8 for dev)

## Hard rules

- TypeScript `strict`. No `any`, no `@ts-ignore`, no unused code, no leftover `console.log`
  (ESLint's `no-console` allows `warn`/`error` only).
- Python fully type-hinted, `pyright` strict mode on `app/`/`api/` (tests dir is relaxed for
  third-party stub gaps — see `apps/api/pyproject.toml`; `scripts/` is not pyright-checked,
  matching how the old `supabase/` folder never was). Every LLM output is validated with
  Pydantic (`app/schemas/feedback.py`); the LLM never emits filler counts, WPM, or pauses —
  those are computed in code (`apps/api/app/services/metrics.py`), retried once on validation
  failure with the error fed back, 502 on a second failure.
- Secrets only in env vars, validated at startup: `apps/web/src/lib/env.ts` (zod) and
  `apps/api/app/core/config.py` (pydantic-settings). Never commit `.env`/`.env.local`.
  `DATABASE_URL` and `JWT_SECRET` are `SecretStr` in `config.py` so they never leak into logs,
  `repr()`, or error messages.
- Every MySQL-backed endpoint that touches another user's rows needs an explicit ownership
  check (`WHERE user_id = :current_user_id`, via `app/services/repo.py`) — see Auth/DB above.
- No duplicate files or duplicate logic. Check whether an existing module already does the job
  before adding a new one (client, util, repo function, etc.).
- All SQL access goes through SQLAlchemy's ORM or parameterized `text()` — never string-format
  or f-string user input into SQL.
- Colors, fonts, radii, motion timings are CSS variables / Tailwind `@theme` tokens
  (`apps/web/src/app/globals.css`). Components reference tokens, not hex values.
- Every animation respects `prefers-reduced-motion` (see the global media query in
  `globals.css` and per-component checks).
- No invented testimonials, user counts, or fake stats anywhere in the product.

## Folder structure

See the master spec (section 2) for the full target layout. Highlights:

- `apps/web/src/app/` — route groups: `(marketing)` (landing), `(auth)`, `(app)` (auth-guarded
  product), plus `styleguide/` (dev-only token/primitive showcase).
- `apps/web/src/components/{ui,effects,landing,interview,report,theme}` — `ui` is
  token-driven primitives (Button, Card, Badge, Stat, Toggle, Tooltip); `effects` holds reusable
  motion pieces (Aurora, TiltCard, WordReveal, MagneticButton, CountUp, QuestionTicker,
  BeamBorder, RippleRings); `landing` composes the full landing page sections; `report` holds
  ScoreRing/StarBars/TranscriptHighlight/BeforeAfterToggle, shared between the landing sample
  report and the real report page (Phase 4); `interview` has `MicOrb`, shared between the hero
  and the future `/interview` page via `layoutId="mic-orb"`.
- `apps/web/src/lib/{env,motion,utils,auth/}` — env validation, shared motion tokens, `cn()`,
  `auth/` has the JWT decode helper, session-cookie helpers, and the server-side fetch wrapper
  used by the Next.js route handlers that talk to the API.
- `apps/web/src/app/api/auth/{register,login,refresh,logout}/route.ts` — proxy to the API's
  `/v1/auth/*` endpoints and set the session as httpOnly cookies. `proxy.ts` (Next middleware)
  gates `APP_PREFIXES` on cookie presence/expiry as a UX-only redirect; the real authorization
  boundary is always `get_current_user` on the API side.
- `apps/api/app/models/` — SQLAlchemy models (`User`, `Profile`, `Question`, `InterviewSession`,
  `Answer`, `RefreshToken`); `apps/api/app/db.py` — async engine/session factory; `apps/api/alembic/`
  — migrations, `alembic upgrade head` builds the schema.
- `apps/api/app/{core,routers,schemas,services,prompts}` — `core` has config/errors/logging/auth
  (JWT issue/verify, password hashing, `get_current_user`); `routers` are thin
  (`questions`/`sessions`/`answers`/`progress`, all `/v1`, auth-required); `services/repo.py`
  holds every DB query, each one scoped to the caller's `user_id`; `services/stt.py` (Groq
  Whisper, verbose_json, one retry on 429/5xx), `services/metrics.py` (pure, 100%-tested filler/
  WPM/pause/rambling functions — see Hard rules), `services/llm.py` (Groq Llama JSON mode,
  temperature 0.3, one retry on Pydantic validation failure), `services/feedback.py` (the single
  place that splits an `LLMFeedback` + computed metrics into the persisted `Answer` row, and
  joins them back for the API response — see its docstring before adding a second place that
  does this). `app/prompts/feedback.py` holds the STAR-scoring system prompt.
- `apps/api/api/index.py` — Vercel entry point (`from app.main import app`).
- `apps/api/scripts/seed.py` — the 96-question seed bank (12 per role × 8 roles), idempotent
  per role. `apps/api/scripts/try_answer.py` — posts a sample audio file to `POST /v1/answers`
  against a running API, without the web UI.

## Commands

Root (`pnpm` scripts fan out to both apps):

```
pnpm install
pnpm dev          # both apps in parallel
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Per-app (from repo root):

```
pnpm --filter ./apps/web <dev|lint|typecheck|test|test:e2e|build|format>
pnpm --filter ./apps/api <dev|lint|typecheck|test|build|format>
```

`apps/api` scripts shell out to `uv` (`uv run ruff/pyright/pytest`, `uv export` for
`requirements.txt` on `build`).

Quality gate before closing any phase:

```
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

(API build step is `uv export` for `requirements.txt`; the real correctness check is
`uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest`.)
Always verify with a production `next build && next start`, not just `next dev`.

## Design tokens (current — dark is default)

Defined in `apps/web/src/app/globals.css` as CSS variables under `.dark`/`.light`, mapped into
Tailwind v4's `@theme inline`. Dark values match the locked spec exactly (Ink `#0A0B0F`, Lime
`#D4FF5A`, Violet `#8C7BFF`, Coral `#FF5A4E`, Amber `#FFB547`, Mint `#3DDC97`, etc.) and were
confirmed against the `Landing.pdf` mockup in Phase 2. **Light values are still the documented
fallback from the spec** — no light-mode mockup has been provided yet. Replace the `.light` block
once one exists.

The theme fallback rule that matters if you touch this file: the pre-hydration `:root` fallback
must stay scoped as `:root:not(.light):not(.dark)`. A bare `:root` selector has the same CSS
specificity as `.light`/`.dark` (both count as one class), so whichever rule is declared last in
the file wins regardless of which theme is active — that exact bug shipped once in Phase 2 (light
mode silently rendered dark) and was caught only by screenshotting both themes, not by lint/build.

Fonts: Bricolage Grotesque (`--font-display`), Geist (`--font-body`), JetBrains Mono
(`--font-mono-metric`), all self-hosted via `next/font/google`, wired in `layout.tsx`.

See `/styleguide` (dev route) for a live render of every token and primitive in both themes.

## Status

- **Phase 1 (Foundation):** done. Monorepo, tooling, CI, design tokens, fonts, theming (with
  View Transitions circle-reveal toggle), Lenis, motion tokens, UI primitives, `/styleguide`,
  FastAPI skeleton (`/v1/health`), Supabase migration + seed.
- **Phase 2 (Landing page):** done, built from a dark-mode PDF mockup (no raw HTML export, no
  light-mode mockup — see gaps below) plus a detailed UI review. Full landing page: Nav (working
  anchors, scroll-aware blur), Hero with the 3D tilt hero card (live demo loop: typing transcript,
  filler count pop, timer color rule) and beam border/ripple rings, word-reveal H1, fixed
  question ticker (no jump-back, inline carets, pauses on hidden tab), scroll-pinned "How it
  works" flip-card story (desktop only; stacked fade-in fallback below `lg` and under reduced
  motion), sample report section (score ring, STAR bars, transcript highlighting, before/after
  toggle with a sliding `layoutId` pill), roles grid, self-drawing progress chart with count-up
  stats, final CTA, footer. `MicOrb` carries `layoutId="mic-orb"` / `viewTransitionName` for the
  future landing → `/interview` morph, but nothing routes there yet — see gaps below.
- **Phase 2.5 (Data & auth layer rebuild):** done. Replaced Supabase (Postgres + Auth + RLS) with
  MySQL 8 + SQLAlchemy 2 async + Alembic, and FastAPI-native JWT auth (argon2 password hashing,
  rotating refresh tokens tracked in a `refresh_tokens` table for revocation). `/v1/auth/{register,
  login,refresh,logout,me}` implemented and tested, including a cross-user authorization regression
  suite (`apps/api/tests/test_cross_user_authorization.py`) standing in for the RLS that no longer
  exists. Web: real email/password sign-in form, Next.js route handlers proxy to the API and set
  the session as httpOnly cookies, `proxy.ts` middleware gates guarded routes on cookie
  presence/expiry. DB host: Aiven's free-tier MySQL 8 for staging/prod, local Docker MySQL 8 for
  dev. Auth scope: email + password only for v1 — Google OAuth is a post-Phase-6 stretch goal (not
  built; would need `authlib` OAuth wiring and a new callback route). `supabase/` directory and
  all `@supabase/*` dependencies removed from both apps.
- **Phase 3 (Backend core — STT, metrics, LLM, endpoints):** done. `GET /v1/questions`
  (role required, difficulty optional, active-only), `POST /v1/sessions`, `GET /v1/sessions`,
  `POST /v1/answers` (multipart: `audio`, `session_id`, `question_id`, `time_cap_s` →
  `AnswerReport`), `GET /v1/answers/{id}`, `GET /v1/progress` (per-session aggregates, computed
  in Python rather than dialect-specific JSON-column SQL). Answers upload validation: rejects
  >4MB, rejects non-webm/ogg, rejects a transcribed duration that exceeds `time_cap_s` + 10s
  grace, rejects a silent/empty transcript, 30/user/day rate limit (`429`, counted from
  `answers.created_at` directly — no separate counter table). Audio is transcribed in memory
  and never persisted. STT/LLM calls are mocked in tests (`monkeypatch` on `stt.transcribe` /
  `llm.generate_feedback`) — **the actual live Groq STT/LLM integration is unverified against
  real credentials**, since this environment has no `GROQ_API_KEY`; `scripts/try_answer.py` is
  the way to smoke-test it for real. `services/metrics.py` is pure and 100% unit-tested
  (`tests/test_metrics.py`), including the boundary cases (`>2.0s` pause threshold, rambling
  grace window). The Phase 2.5 CORS tightening (`GET`/`POST`, `Authorization`/`Content-Type`)
  already covered multipart POST, so no further change was needed here.
- **Phases 4–6:** not started. See the master spec for scope.

## Known gaps / deliberate scope cuts from Phase 2

- **No design mockup files, still.** `/design` was empty; Phase 2 was built from a dark-mode PDF
  (`Landing.pdf`, pasted in chat) plus written review notes, not the `landing-dark/Main.dc.html`
  export the master spec expects. Values were extracted by eye from the PDF, not read out of
  inline styles — treat them as close, not pixel-exact.
- **No light-mode mockup.** `.light` in `globals.css` is still the spec's documented fallback,
  unverified against a real design.
- **`/sign-in` is now a real, working email/password auth form** (Phase 2.5), but
  **`/interview`, `/report/[answerId]`, `/progress`, `/settings` still don't exist** (that's
  Phases 4–5) — `proxy.ts` will redirect to `/sign-in` for all of them today. Hero and final CTAs
  still smooth-scroll to `#roles` instead of navigating away, since role cards are informational
  only until the interview flow exists. `MicOrb`'s shared-element setup is ready for Phase 4 but
  unused until a second route exists.
- **GitHub footer link** points at this repo's own real remote
  (`github.com/AsjalAbdullahButt/Rehearse`); no LinkedIn link was added since no real profile URL
  was available and the rules here forbid inventing one.
