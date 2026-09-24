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
  product: `layout.tsx` fetches the current user server-side and redirects to `/sign-in` if
  there isn't one — belt-and-suspenders on top of `proxy.ts`'s cookie-presence gate; `interview/
  page.tsx` and `report/[answerId]/page.tsx` live here), plus `styleguide/` (dev-only
  token/primitive showcase).
- `apps/web/src/components/{ui,effects,landing,interview,report,theme}` — `ui` is
  token-driven primitives (Button, Card, Badge, Input, Stat, Toggle, Tooltip); `effects` holds
  reusable motion pieces (Aurora, TiltCard, WordReveal, MagneticButton, CountUp, QuestionTicker,
  BeamBorder, RippleRings); `landing` composes the full landing page sections; `report` holds
  ScoreRing/StarBars/TranscriptHighlight/BeforeAfterToggle, shared between the landing sample
  report and the real `/report/[answerId]` page; `interview` has `MicOrb` (shared between the
  hero and `/interview` via `layoutId="mic-orb"`; takes an optional `recording` prop that swaps
  it lime→coral, defaulted off so the landing usage is unaffected), `RolePicker`,
  `InterviewFlow` (the recording state machine), and `Waveform` (real mic input via
  `AnalyserNode`, not the landing's canned bar animation).
- `apps/web/src/hooks/` — `use-audio-recorder` wraps `getUserMedia`/`MediaRecorder` (webm/opus
  @32kbps)/`AnalyserNode`; `use-countdown` ticks a cap down and fires once on expiry;
  `use-speech-voices` lists `speechSynthesis.getVoices()` (populated async via the
  `voiceschanged` event); `use-has-mounted` (`useSyncExternalStore`-based — see below) is for
  any value genuinely unknown until after hydration, e.g. `next-themes`' `theme`. All were
  written to satisfy the newer `react-hooks/refs` and `react-hooks/set-state-in-effect` lint
  rules (React Compiler-era): refs are updated via a no-deps `useEffect`, never during render;
  state resets on a prop flip happen as a guarded update during render (React's documented
  pattern), never inside an effect body; and "has this mounted yet" is `useSyncExternalStore`
  with a server/client snapshot pair, never a `useState`+`useEffect(() => setX(true), [])` pair
  (that shape is exactly what the rule flags) — `ThemeToggle` and `SettingsForm` both use
  `use-has-mounted` for this rather than each rolling their own.
- `apps/web/src/lib/{env,motion,utils,auth/,interview/}` — env validation, shared motion
  tokens (also `formatTime`/`getTimerTone` — the countdown color rule, amber ≤30s / coral ≤10s,
  shared between the landing demo timer and the real recorder), `cn()`; `auth/` has the JWT
  decode helper, session-cookie helpers (`buildSessionCookies` is the single source both a
  `NextResponse` and the mutable `cookies()` store apply), `session.ts` (`getValidAccessToken`
  — refreshes transparently if the access-token cookie is expired), and `proxy.ts`
  (`proxyAuthedRequest` — the one place every authed `/api/*` route handler attaches the bearer
  token and forwards; not interview-specific despite living next to session/cookie code, since
  `/api/profile` needs it too); `interview/` has the wire types mirroring the API's Pydantic
  schemas (despite the folder name, this covers the whole product domain — questions, sessions,
  answers, progress, profile — not just the recording flow), `server.ts` (direct API reads for
  Server Components, one `fetchFromApi<T>` helper underneath `fetchCurrentUser`/
  `fetchAnswerReport`/`fetchProgress`/`fetchProfile`), and `transcript.ts` (maps the API's flat
  `TranscriptPart` shape into `TranscriptHighlight`'s discriminated union).
- `apps/web/src/app/api/{auth,interview,profile}/**/route.ts` — every one of these proxies
  server-side to the FastAPI `/v1/*` API and never runs in the browser; `auth/*` sets the
  session as httpOnly cookies, the rest attach the bearer token read from those cookies via
  `proxyAuthedRequest` (`interview/answers/route.ts` forwards the browser's multipart
  `FormData` — including the audio `Blob` — unchanged). `proxy.ts` (Next middleware, at
  `src/proxy.ts` — not to be confused with `lib/auth/proxy.ts` above) gates `APP_PREFIXES` on
  cookie presence/expiry as a UX-only redirect; the real authorization boundary is always
  `get_current_user` on the API side.
- `apps/api/app/models/` — SQLAlchemy models (`User`, `Profile`, `Question`, `InterviewSession`,
  `Answer`, `RefreshToken`); `apps/api/app/db.py` — async engine/session factory; `apps/api/alembic/`
  — migrations, `alembic upgrade head` builds the schema.
- `apps/api/app/{core,routers,schemas,services,prompts}` — `core` has config/errors/logging/auth
  (JWT issue/verify, password hashing, `get_current_user`); `routers` are thin
  (`questions`/`sessions`/`answers`/`progress`/`profile`, all `/v1`, auth-required);
  `services/repo.py`
  holds every DB query, each one scoped to the caller's `user_id`; `services/stt.py` (Groq
  Whisper, verbose_json, one retry on 429/5xx), `services/metrics.py` (pure, 100%-tested filler/
  WPM/pause/rambling functions — see Hard rules), `services/llm.py` (Groq Llama JSON mode,
  temperature 0.3, one retry on Pydantic validation failure), `services/feedback.py` (the single
  place that splits an `LLMFeedback` + computed metrics into the persisted `Answer` row, and
  joins them back for the API response — see its docstring before adding a second place that
  does this). `app/prompts/feedback.py` holds the STAR-scoring system prompt.
  `metrics.build_transcript_parts` rebuilds the transcript into text/filler/pause segments for
  the report page's word-level highlighting (`AnswerReport.transcript_parts`) — the single
  source of truth for what's a filler, so the web app never re-implements that heuristic in
  TypeScript (only single-word fillers are flagged there, not the multi-word phrases
  `count_fillers` also matches — see its docstring).
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
- **Phase 4 (Auth'd product UI — interview flow):** done. `(app)/layout.tsx` guards the whole
  route group; `/interview` is a client-side state machine (setup → starting → ready →
  analyzing → error, with "recording" derived from the recorder's own status rather than
  mirrored into a fifth stage) that creates a session, fetches a random question for the
  chosen role/difficulty, speaks it via `speechSynthesis`, records webm/opus through
  `MediaRecorder`, shows a real `AnalyserNode`-driven waveform and a countdown (amber@30s/
  coral@10s/auto-stop@0:00, reusing the landing demo's exact thresholds and color tokens), and
  uploads to `POST /v1/answers` through the `/api/interview/answers` proxy; `/report/[answerId]`
  renders the real `AnswerReport` through the existing `ScoreRing`/`StarBars`/
  `TranscriptHighlight`/`BeforeAfterToggle` components (star scores remapped `situation/task/
  action/result` → `s/t/a/r`, "after" is the LLM's `sample_answer` as a single "added" part).
  Closed the Phase 2.5 gap note: the Roles grid cards and the Hero/FinalCta "Start a mock
  interview" CTAs now route to `/interview` (`?role=<slug>` from the grid) instead of
  smooth-scrolling to `#roles` — unauthenticated visitors land on `/sign-in?next=/interview`
  via the existing middleware, no new gating logic needed. **Known limitation, stated
  plainly:** `MicOrb`'s `layoutId`/`viewTransitionName` plumbing is wired on both the hero and
  `/interview`, but Next.js's App Router doesn't wrap client-side navigations in the View
  Transitions API by default — that requires an experimental runtime flag
  (`app-page-experimental`) this repo deliberately does not enable, given the stability risk of
  an experimental rendering runtime versus the payoff of one decorative cross-page morph. So
  today the navigation is a normal (non-animated) route change, not the shared-element
  transition the component is built for. Also unverified end-to-end: the real
  `MediaRecorder`/`getUserMedia`/`speechSynthesis` browser APIs — this environment has no
  browser to test them in. Verified instead: full request pipeline (multipart forwarding, auth,
  cookie refresh, ownership checks, error propagation) over real HTTP against a running
  Next.js + FastAPI stack, up through a real (expected) Groq failure from a fake API key.
- **Phase 5 (Progress, settings, polish):** done. Backend: `GET`/`PATCH /v1/profile` (new —
  no endpoint existed for the `profiles` table before this; PATCH uses `exclude_unset` so an
  omitted field is left alone, not reset to null; `answer_cap_s`/`voice_rate` validated against
  the same `ANSWER_CAP_CHOICES`/range the DB `CHECK` constraints enforce). Web: `/progress`
  renders `GET /v1/progress` as a per-session card list — real data only, an honest "No
  sessions yet" empty state, and a distinct "couldn't load" state for a failed fetch (no
  carried-over numbers from the landing demo chart, which stays marketing-only per the rules
  above); `/settings` persists default time cap + interviewer voice (listed via
  `speechSynthesis.getVoices()`, with a "preview voice" button) + speaking rate to the profile,
  plus a theme control (in addition to the existing header `ThemeToggle`, since the spec lists
  theme as a Settings item specifically). Extracted `OptionPill` out of `RolePicker` into
  `components/ui/` once Settings needed the same pill-select pattern for time cap and theme.
  Added a nav bar (Interview/Progress/Settings links) to `(app)/layout.tsx`'s header — it only
  had the logo and sign-out before, with nowhere to navigate to the new pages. Added a shared
  `(app)/loading.tsx` Suspense fallback (the existing root `not-found.tsx`/`error.tsx` already
  covered 404s/thrown errors app-wide from Phase 1, so no new error boundary was needed there —
  each page instead handles its own *expected* fetch failures inline, e.g. `/progress`'s
  "couldn't load" state, which a thrown-error boundary wouldn't catch since nothing throws).
- **Phase 6:** not started. See the master spec for scope.
- **Post-Phase-5 hardening pass:** in progress, tracked against a separate "UX polish +
  production hardening" master prompt (not the phase spec above). Completed so far: **A** (UI/UX
  audit of the auth'd flow — mic-permission recovery copy, `aria-live` countdown announcements,
  answer-upload retry that preserves the recording instead of discarding it, a shared toast
  system + session-expiry redirect, sign-in password toggle, report-specific not-found/loading
  states); **B** (fixed an N+1 in `get_progress_for_user`, added `limit`/`offset` pagination to
  `GET /sessions`/`GET /progress`, added `GET /v1/health/ready`, gave the LLM call the same
  timeout+retry policy STT already had via new `services/groq_retry.py`); **C** (explicit MySQL
  pool sizing in `db.py` for serverless — indexes/audio-non-persistence/naive-UTC/migration
  downgrade were all already correct); **D** (added `POST /v1/auth/logout-all`; cookie
  flags/JWT/argon2/refresh-token revocation were all already correct; no password-reset flow
  still a named, unbuilt gap); **F** (slowapi in-memory rate limiting on login/register/answers,
  429s carry `Retry-After`; explicitly instance-local, not shared across concurrent Vercel
  invocations); **I** (in-process TTL cache for `GET /v1/questions`; `GET /progress` caching
  skipped as unnecessary once B's N+1 fix landed); **H** (`docs/runbook.md`, `vercel.json`'s
  `maxDuration` raised to Hobby's 60s cap). Not started: **E** (CI/CD deploy stage, dependency/
  static-analysis scanning, branch protection) and **G** (Sentry, structured logging, request
  IDs) — both need external accounts/credentials this environment doesn't have.

## Known gaps / deliberate scope cuts from Phase 2

- **No design mockup files, still.** `/design` was empty; Phase 2 was built from a dark-mode PDF
  (`Landing.pdf`, pasted in chat) plus written review notes, not the `landing-dark/Main.dc.html`
  export the master spec expects. Values were extracted by eye from the PDF, not read out of
  inline styles — treat them as close, not pixel-exact.
- **No light-mode mockup.** `.light` in `globals.css` is still the spec's documented fallback,
  unverified against a real design.
- **All four guarded product pages now exist and are real** (`/interview`, `/report/[answerId]`,
  `/progress`, `/settings` — Phases 2.5, 4, 5). `display_name`/`target_role` on `Profile` are
  modeled and returned by `GET /v1/profile` but have no UI to set them yet — not in the Phase 5
  spec's "time cap, voice, theme" scope, left for whenever a real need for them shows up rather
  than building settings UI ahead of a use case.
- **GitHub footer link** points at this repo's own real remote
  (`github.com/AsjalAbdullahButt/Rehearse`); no LinkedIn link was added since no real profile URL
  was available and the rules here forbid inventing one.
