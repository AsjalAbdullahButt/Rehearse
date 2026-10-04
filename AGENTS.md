# AGENTS.md — Rehearse

Conventions summary for anyone (human or agent) working in this repo. Keep this updated as
phases land.

## What this is

Rehearse is an AI mock interview coach. Pick a role, run a full multi-question mock interview
(server-orchestrated, optionally personalized to a company/job description/candidate background),
answer each spoken question into the mic, get transcription, filler/pace/pause metrics (computed
in code, never guessed by an LLM), category-specific rubric scoring (behavioral/technical/
situational — not a one-size-fits-all STAR shape), a stronger sample answer, and progress tracking
across sessions. Portfolio-grade MVP — polish and correctness over feature count.

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
- **STT/LLM:** Groq (`whisper-large-v3-turbo`, `openai/gpt-oss-120b` via JSON mode + Pydantic
  validation — the model name is env-configurable (`GROQ_LLM_MODEL`) since Groq's hosted catalog
  changes over time; the original default, `llama-3.3-70b-versatile`, was retired from Groq at
  some point and now 404s — see `app/core/config.py`'s `groq_llm_model` docstring before
  assuming a 502 `llm_failed` is a code bug)
- **Resume parsing:** `pypdf` (pure-Python PDF text extraction, no native deps — serverless-
  friendly), feeding the same Groq LLM for extraction; see the "Resume upload" status entry below.
- **Free tiers only:** Vercel Hobby, Groq free API, [Aiven free-tier MySQL](https://aiven.io/free-mysql-database)
  (or local Docker MySQL 8 for dev)

## Hard rules

- TypeScript `strict`. No `any`, no `@ts-ignore`, no unused code, no leftover `console.log`
  (ESLint's `no-console` allows `warn`/`error` only).
- Python fully type-hinted, `pyright` strict mode on `app/`/`api/` (tests dir is relaxed for
  third-party stub gaps — see `apps/api/pyproject.toml`; `scripts/` is not pyright-checked,
  matching how the old `supabase/` folder never was). Every LLM output is validated with
  Pydantic (`app/schemas/feedback.py`'s `LLMFeedback`, a discriminated union of category-specific
  rubrics); the LLM never emits filler counts, WPM, or pauses — those are computed in code
  (`apps/api/app/services/metrics.py`), retried once on validation failure (or on a rubric
  category mismatch) with the error fed back, 502 on a second failure. Evidence quotes the LLM
  cites are verified against the real transcript before being shown back to the user — a quote
  that doesn't actually appear in the transcript is dropped, never surfaced as if it were real.
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
- `apps/web/src/components/{ui,effects,landing,interview,report,progress,settings,theme}` — `ui`
  is token-driven primitives (Button, Card, Badge, Input, Stat, Toggle, Tooltip, OptionPill);
  `effects` holds reusable motion pieces (Aurora, TiltCard, WordReveal, MagneticButton, CountUp,
  QuestionTicker, BeamBorder, RippleRings); `landing` composes the full landing page sections;
  `report` holds ScoreRing/RubricBars/TranscriptHighlight/BeforeAfterToggle, shared between the
  landing sample report and the real `/report/[answerId]` page (`RubricBars` replaced `StarBars`
  once scoring went category-specific — it takes a generic `{key,label,score}[]`, not a fixed
  S/T/A/R shape); `progress` holds `TrendChart` (hand-rolled SVG line chart, no charting library)
  and `ProgressView` (the `/progress` page's client component: role filter, four trend charts,
  session cards with delete); `settings` holds `AccountPrivacyPanel` (password change + account
  deletion, alongside `SettingsForm`'s time-cap/voice/theme prefs); `interview` has `MicOrb`
  (shared between the hero and `/interview` via `layoutId="mic-orb"`; takes an optional
  `recording` prop that swaps it lime→coral, defaulted off so the landing usage is unaffected),
  `RolePicker`, `InterviewFlow` (the recording state machine), and `Waveform` (real mic input via
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
  answers, progress, profile — not just the recording flow; `Rubric` is a discriminated union of
  `BehavioralRubric`/`TechnicalRubric`/`SituationalRubric`, `FeedbackReport` is the lenient
  read-side shape), `rubric-insights.ts` (`RUBRIC_FIELD_INFO`/`rubricAreas`/
  `strongestRubricArea`, keyed by category — replaced `star-insights.ts`), `server.ts` (direct
  API reads for Server Components, one `fetchFromApi<T>` helper underneath `fetchCurrentUser`/
  `fetchAnswerReport`/`fetchProgress`/`fetchProfile`), and `transcript.ts` (maps the API's flat
  `TranscriptPart` shape into `TranscriptHighlight`'s discriminated union).
- `apps/web/src/app/api/{auth,interview,profile}/**/route.ts` — every one of these proxies
  server-side to the FastAPI `/v1/*` API and never runs in the browser; `auth/*` sets the
  session as httpOnly cookies (including `change-password/route.ts` and `account/route.ts` —
  the latter's `DELETE` also clears the session cookies on a successful 204), the rest attach the
  bearer token read from those cookies via `proxyAuthedRequest` (`interview/answers/route.ts`
  forwards the browser's multipart `FormData` — including the audio `Blob` — unchanged;
  `interview/sessions/[sessionId]/route.ts` has both `GET` and `DELETE`). `proxy.ts` (Next
  middleware, at `src/proxy.ts` — not to be confused with `lib/auth/proxy.ts` above) gates
  `APP_PREFIXES` on cookie presence/expiry as a UX-only redirect; the real authorization boundary
  is always `get_current_user` on the API side.
- `apps/api/app/models/` — SQLAlchemy models (`User`, `Profile`, `Question`, `InterviewSession`,
  `SessionQuestion`, `Answer`, `RefreshToken`, `RateLimitHit`); `apps/api/app/db.py` — async
  engine/session factory; `apps/api/alembic/` — migrations, `alembic upgrade head` builds the
  schema.
- `apps/api/app/{core,routers,schemas,services,prompts}` — `core` has config/errors/logging/auth
  (JWT issue/verify with issuer/audience claims, password hashing, `get_current_user`); `routers`
  are thin (`questions`/`sessions`/`answers`/`progress`/`profile`, all `/v1`, auth-required —
  `sessions` also has `DELETE /sessions/{id}` for the privacy-controls "delete this session's
  data" flow); `services/repo.py` holds every DB query, each one scoped to the caller's
  `user_id`, including `delete_session_and_all_data`; `services/stt.py` (Groq Whisper,
  verbose_json, one retry on 429/5xx, extracts `avg_logprob`/`avg_no_speech_prob` from segments
  for transcription-confidence signalling — never fabricated, only ever propagated),
  `services/metrics.py` (pure, 100%-tested filler/WPM/pause/rambling functions — definite vs.
  possible filler tiers, category-scaled rambling thresholds, `assess_transcription_quality` —
  see Hard rules), `services/llm.py` (Groq Llama JSON mode, temperature 0.3, one retry on
  Pydantic validation failure or rubric-category mismatch), `services/feedback.py` (the single
  place that splits an `LLMFeedback` + computed metrics into the persisted `Answer` row, verifies
  evidence quotes against the real transcript, and joins them back for the API response — see its
  docstring before adding a second place that does this), `services/question_orchestrator.py`
  (server-controlled multi-question session flow — picks each session's next question by
  category round-robin for "mixed" focus, avoids repeats). `app/prompts/feedback.py` holds the
  category-specific rubric-scoring system prompt, with an explicit injection-defense paragraph
  and untrusted transcript/candidate-context data serialized as a quoted JSON payload, never
  interpolated into prompt text. `metrics.build_transcript_parts` rebuilds the transcript into
  text/filler/pause segments for the report page's word-level highlighting
  (`AnswerReport.transcript_parts`) — the single source of truth for what's a filler, so the web
  app never re-implements that heuristic in TypeScript (only single-word fillers are flagged
  there, not the multi-word phrases `count_fillers` also matches — see its docstring).
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
- **Post-Phase-5 hardening pass:** done. Tracked against a separate "UX polish + production
  hardening" master prompt (not the phase spec above). **A** (UI/UX audit of the auth'd flow —
  mic-permission recovery copy, `aria-live` countdown announcements, answer-upload retry that
  preserves the recording instead of discarding it, a shared toast system + session-expiry
  redirect, sign-in password toggle, report-specific not-found/loading states); **B** (fixed an
  N+1 in `get_progress_for_user`, added `limit`/`offset` pagination to `GET /sessions`/
  `GET /progress`, added `GET /v1/health/ready`, gave the LLM call the same timeout+retry policy
  STT already had via `services/groq_retry.py`); **C** (explicit MySQL pool sizing in `db.py` for
  serverless); **D** (added `POST /v1/auth/logout-all`); **F** (slowapi in-memory rate limiting on
  login/register/answers, 429s carry `Retry-After`; explicitly instance-local, not shared across
  concurrent Vercel invocations); **I** (in-process TTL cache for `GET /v1/questions`); **H**
  (`docs/runbook.md`, `vercel.json`'s `maxDuration` raised to Hobby's 60s cap). **E** (CI/CD
  deploy stage, dependency/static-analysis scanning, branch protection) and **G** (Sentry,
  structured logging, request IDs) were left unstarted at the time — both needed external
  accounts/credentials this environment doesn't have; **G**'s scope (request IDs, structured
  logging) was picked back up and shipped separately, see below.
- **Multi-question sessions, security hardening, and category-specific rubrics** (a second,
  larger round of work after Phase 5, superseding the original spec's "Phase 6" placeholder):
  done, and this is the current shape of the product.
  - **Server-orchestrated multi-question interviews.** A session (`POST /v1/sessions`) no longer
    grades one answer — it now runs a configurable number of questions (`question_count`,
    5/10/15), optionally personalized with `company`/`industry`/`job_description`/
    `candidate_background`/`skills`/`focus_topics`/`years_experience`/`interviewer_style`/
    `language` (all optional, all size-capped and validated server-side — see
    `test_sessions_router.py`'s oversized-field tests). `services/question_orchestrator.py`
    picks each question server-side (round-robin across behavioral/technical/situational for
    "mixed" focus, avoiding repeats within a session) rather than the client choosing one
    up-front; `SessionQuestion` is a new model tracking each question actually asked, its
    category, and its source. The web `/interview` flow and a new `/session/[sessionId]/summary`
    page were rewritten around this — an interview is now "answer question N of M, see a
    running summary at the end" instead of "answer one question, see one report."
  - **Category-specific rubrics, not a single STAR shape.** `schemas/feedback.py`'s `Rubric` is
    now a `Literal`-discriminated union of `BehavioralRubric` (STAR-based), `TechnicalRubric`
    (correctness/depth/communication + `reference_answer`), and `SituationalRubric` — each
    category is scored on what actually matters for it, rather than forcing a technical answer
    into Situation/Task/Action/Result. `StarBars` was replaced by the generic `RubricBars`;
    `star-insights.ts` was replaced by `rubric-insights.ts`. `answer_example`/`rubric` replaced
    the old `sample_answer`/`star` column names (migration `0007`). Legacy rows default to
    `category="behavioral"` so old data still reads correctly through the new (lenient)
    `FeedbackReport` read-side schema.
  - **Prompt-injection hardening.** `prompts/feedback.py` serializes the transcript and any
    candidate-supplied context (job description, background) as a quoted JSON data payload with
    an explicit system-prompt paragraph telling the model to treat it as data, never as
    instructions — tested with an adversarial transcript/context in
    `test_prompts_feedback.py` asserting the injected text never leaks into prompt structure.
    `llm.py` additionally validates that the LLM's returned rubric `category` matches the
    question's actual category, retrying (same path as a Pydantic validation failure) on
    mismatch rather than silently trusting the model's self-report.
  - **Evidence-quote verification.** `services/feedback.py` checks every evidence quote the LLM
    cites against the real transcript (normalized substring match) before it reaches the user —
    a fabricated quote is dropped rather than shown as if it were real. `/report/[answerId]`
    renders only verified evidence.
  - **Deterministic metrics got sharper.** `count_fillers` now separates definite fillers (always
    counted) from possible ones (single ambiguous words like "so"/"right"), reported separately
    rather than conflated into one number. `assess_rambling` is now category- and
    density/repetition-aware (a long *technical* answer gets a larger duration allowance than a
    long *behavioral* one; a long-but-dense, non-repetitive answer isn't flagged just for being
    long). `assess_transcription_quality` surfaces a "this transcript may be unreliable" warning
    from Groq's own `avg_logprob`/`avg_no_speech_prob` confidence signals — propagated, never
    invented.
  - **Auth/security hardening**, on top of what Phase 2.5/D already had: timing-safe login
    (`hmac.compare_digest`-equivalent constant-time comparison, avoiding a user-enumeration
    timing oracle), JWT issuer/audience claims, startup rejection of a weak `JWT_SECRET`, an
    idempotency key on answer submission (client-generated UUID reused on retry, preventing
    duplicate processing/double-billing of the same recording), refresh-token reuse detection
    with a grace period (a rotated-out token replayed within the grace window is tolerated as a
    likely race, replayed after it triggers full revocation of that token family), a
    trusted-proxy client-IP header for rate limiting gated behind a shared `INTERNAL_PROXY_SECRET`
    compared with `hmac.compare_digest`, a request-body-size cap enforced before multipart
    parsing buffers the body (denial-of-service hardening), audio magic-byte sniffing instead of
    trusting the client's `Content-Type` header, and security response headers (CSP, HSTS,
    frame-options, referrer-policy, permissions-policy) on every response.
  - **Progress trends (supersedes the original spec's basic progress list).** `GET /v1/progress`
    now also returns `avg_filler_rate_per_100_words` and a per-category `category_scores` map per
    session. `/progress` (`ProgressView`) renders four hand-rolled SVG line charts (`TrendChart`
    — no charting library dependency, consistent with `ScoreRing`/`RubricBars`'s existing
    hand-rolled pattern; fixed lime/violet/mint categorical colors, legend only for 2+ series, an
    `sr-only` accessible `<table>` fallback, per-point `<title>` tooltips) for overall score,
    score by category, filler rate, and pace, plus a role filter and the per-session card list.
  - **Privacy controls.** `DELETE /v1/sessions/{id}` (`repo.delete_session_and_all_data`,
    ownership-checked) removes one interview's answers/questions without touching the account;
    `POST /v1/auth/change-password` and `DELETE /v1/auth/me` (both require the current password)
    round out account lifecycle. `/settings` gained `AccountPrivacyPanel`: explicit plain-language
    copy on what's stored (transcript, not raw audio) and where it goes (Groq, for transcription
    and feedback generation), a password-change form, and a two-step confirm-before-delete
    account-deletion flow that signs the user out and redirects home on success. `/progress`'s
    session cards gained a matching confirm-before-delete control for per-session deletion.
  - **Observability: request IDs + structured, PII-free error logging.** `RequestIdMiddleware`
    (`app/core/middleware.py`, outermost of all middleware so it covers even a request
    `MaxBodySizeMiddleware` rejects) reuses an incoming `X-Request-Id` header when the Next BFF
    forwarded a well-formed one, otherwise generates a `uuid4`; the ID lives in a `ContextVar`
    (`app/core/request_context.py`) for the request's lifetime, is echoed back as a response
    header on every response, and is folded into every log line (`core/logging.py`'s
    `_RequestIdFilter`) and every JSON error body (`core/errors.py`'s `_error_response`) — so a
    user-reported failure can be traced to exact server-side log lines without ever needing to
    log the request/response content itself. `apps/web/src/lib/auth/api.ts`'s `apiFetch`
    generates the ID for every outbound call to the API (reusing one if the caller already set
    it) and `parseApiError` reads it back off the response (body first, header as fallback) and
    emits one structured `console.error` JSON line — status/code/request_id only, never the
    request or response body, since those can hold passwords, transcripts, job descriptions, or
    candidate background text. Bundled with this: `apiErrorResponse()` was pulled out as the one
    place every BFF route handler (`login`/`register`/`refresh`/`proxyAuthedRequest`) builds an
    `{error: {code, message, request_id}}` response, replacing four copies of the same object
    literal per the "no duplicate logic" rule above.
  - **Resume upload, to pre-fill personalization instead of typing it by hand.** `POST
    /v1/resume/parse` (auth-required, rate-limited 10/hour/user) accepts a PDF (2MB cap, magic-
    byte-sniffed like audio uploads), extracts its text in memory via `pypdf`
    (`services/resume_parser.py` — capped at 6 pages / 20k characters regardless of how much a
    pathological PDF contains, and rejects a password-protected or text-less/scanned-image PDF
    with a specific error rather than silently returning nothing), and sends that text to Groq
    (`llm.extract_resume_data`, `prompts/resume.py`) to pull out `candidate_background`,
    `skills`, and `years_experience` — same one-retry-on-validation-failure shape and the same
    "quoted JSON data, never instructions" injection defense as `generate_feedback`. The file and
    its extracted text are never persisted — parsed and discarded within the request, exactly
    like answer audio. Response fields only ever *pre-fill* `SessionSetupForm`'s existing
    personalization inputs (`ResumeUpload` component); nothing is auto-submitted, so a wrong or
    incomplete extraction is always visible and editable before a session starts. Also exposed
    `years_experience` in that form for the first time (the API already accepted it; there was
    just no input for it yet) and tightened `SessionCreate.skills`, which had no length/count cap
    before this (`MAX_SKILLS`/`MAX_SKILL_LENGTH`, mirroring the existing `focus_topics` caps) —
    needed so a resume-derived skills list can't produce something the session schema would
    reject downstream. `AccountPrivacyPanel`'s copy was extended to disclose this new data flow.
    Known gap: no OCR, so a scanned-image PDF with no text layer is rejected rather than read.
  - **Frontend UX audit — closing the gap between what Settings promises and what the interview
    actually does.** Found and fixed: Settings' default time cap / interviewer voice / speaking
    rate were saved to the profile but never read anywhere — `/interview` hardcoded a 120s cap
    and every `SpeechSynthesisUtterance` used the bare browser default voice/rate. `(app)/
    interview/page.tsx` now fetches the profile server-side and passes it into `InterviewFlow`,
    which resolves `voice_name` to a live `SpeechSynthesisVoice` (once the browser's async voice
    list loads) through one shared `speak()` helper used by the question read-aloud, the silence
    nudge, and "repeat the question" alike, and passes `answer_cap_s` into `SessionSetupForm` as
    its pre-filled default instead of a constant.
    - **Mic check + get-ready countdown.** A new `"mic-check"` `FlowState` stage runs once, only
      before a session's first question (`firstStageFor` — resuming later in an in-progress
      session skips it, since the mic's already been exercised): reuses the same
      `useAudioRecorder`/`Waveform` as the real recording, showing live level bars so a bad mic is
      caught before an answer is wasted on it, with "Skip check" always available. Its throwaway
      recording is discarded via `micCheckActiveRef` (a ref, not state — `handleStopped` fires
      from the recorder's real, asynchronously-later "stop" event, so a ref sidesteps a stale-
      closure race a `state.stage` check alone can't). Separately, every question (not just the
      first) now has a 3-second "get ready" beat between pressing "Start recording" and the mic
      actually going live (`isPreparing` + a second `useCountdown` call), instead of the clock and
      mic starting the instant the button is clicked.
    - **"Practice this weak area" and "Repeat this setup" links, from the session summary page.**
      The summary page already computed and displayed the weakest category in prose but never
      linked to it — it now does, as `/interview?role=<role>&focus=<weakest category>`. A second,
      broader "Repeat this setup" link carries the full previous configuration (role, difficulty,
      focus, question count, time cap) as query params. `(app)/interview/page.tsx` and
      `SessionSetupForm` both gained matching `initialDifficulty`/`initialQuestionCount` props to
      receive them (`initialFocus`/`initialAnswerCapS` already existed from the profile-defaults
      work above); an explicit link always wins over a standing profile default.
    - **`target_role` finally has a Settings UI.** `display_name`/`target_role` were modeled on
      `Profile` and returned by `GET /v1/profile` since Phase 5 with no way to set them (a
      previously-documented gap) — `SettingsForm` now has a "Target role" `OptionPill` row
      (reusing `ROLE_OPTIONS`, plus a "No default" pill to clear it), and `(app)/interview/
      page.tsx` falls back to it for `initialRole` whenever no `role` query param is present.
      `display_name` remains unexposed in Settings — it's set at registration
      (`sign-in-form.tsx`) but has no other consumer yet, so adding an editor for it here would be
      UI ahead of a use case, the same reasoning Phase 5 originally gave for leaving both alone.
    Not covered by an automated test: `InterviewFlow` itself has no test file (heavy
    `MediaRecorder`/`getUserMedia`/`speechSynthesis`/`AnalyserNode` usage this environment's
    jsdom can't provide — consistent with Phase 4's already-documented limitation). What's newly
    covered: `SessionSetupForm`'s prop-driven defaults (`session-setup-form.test.tsx`, new) and
    `SettingsForm`'s target-role save/clear behavior (`settings-form.test.tsx`, new) — both were
    previously untested files.
- **Security/reliability hardening pass, round 1 (2026-09-28) — critical fixes + immediate
  session invalidation + password policy.** Tracked against a large, multi-phase hardening
  prompt (auth/rate-limiting/upload-limits/schema-validation/prod-config, then session
  management, API security, UI/a11y, CSP, logging, DB/availability, CI, encryption, async
  reliability — 12 phases). This round implemented Phase 1 in full and the parts of Phase 2 that
  don't need external provider credentials; **later phases (API security audit beyond what
  already existed, UI/UX and accessibility work, CSP nonce migration, structured-logging/Sentry
  hooks, DB TLS enforcement, CI security scanning, email/passkey auth, async answer processing)
  are not yet started** — see the new "Known gaps" entries below for what's deferred and why.
  - **Rate-limit key validation no longer duplicates JWT logic.** `core/rate_limit.py`'s
    `user_or_ip_key` used to call `jwt.decode` directly with only signature+algorithm checking —
    a second, partial validation path alongside `core/auth.py`'s real one, missing issuer/
    audience/expiry/token-type checks. It now goes through a new `core/auth.py:try_decode_token`
    (a non-raising wrapper around the same `decode_token` `get_current_user` uses), so a forged,
    expired, wrong-issuer/audience, or refresh-typed-as-access token can no longer buy a bigger
    per-user rate-limit bucket than an invalid token should get — it now correctly falls back to
    the IP bucket in every one of those cases (`tests/test_rate_limit.py`).
  - **Rate limiting is now a real atomic counter, not an unlocked count-then-insert.** The old
    `RateLimitHit` design (one row per request, counted via a separate unlocked
    `SELECT COUNT(*)`) could let two concurrent requests both read a count under the limit and
    both be let through. Replaced with `RateLimitCounter` (`app/models/rate_limit_counter.py`) —
    one row per `(key, window_start)` fixed-window bucket, incremented via a single atomic UPSERT
    (`INSERT ... ON DUPLICATE KEY UPDATE` on MySQL, `INSERT ... ON CONFLICT DO UPDATE` on the
    SQLite used in tests). Proven race-free by a genuine multi-connection concurrency test
    (`tests/test_rate_limit.py`'s `..._atomically_across_connections`, using N separate
    engine/session pairs against one on-disk SQLite file, not one shared `AsyncSession`). This is
    a fixed window, not the previous sliding one — see the runbook's new "Rate limiting" section
    for the documented boundary-burst tradeoff and what upgrading to Redis/Upstash would look
    like. Migration `0009` drops `rate_limit_hits` and creates `rate_limit_counters` (safe:
    transient bookkeeping only, nothing worth migrating across). Also added dedicated buckets
    login didn't have before: an IP bucket *and* a normalized-email bucket for login (catches
    both "one attacker, many target accounts" and "many IPs, one target account", neither a
    permanent lockout), an IP bucket for `/auth/refresh` (previously unlimited), and a defensive
    IP bucket alongside the existing per-user one for `/answers`.
  - **Upload-size constants now match reality, not a stale promise.** `MAX_REQUEST_BODY_BYTES`
    was `4MB + 1MB = 5MB` — *above* Vercel Functions' real ~4.5MB hard request-body ceiling,
    meaning the platform itself would reject some requests this app's own middleware claimed to
    accept. `app/core/limits.py` now derives it as `MAX_AUDIO_FILE_BYTES + 256KB ≈ 4.25MB`, with
    a `VERCEL_FUNCTION_BODY_LIMIT_BYTES` constant documenting the real ceiling this must stay
    under. Separately, the resume BFF route (`apps/web/.../interview/resume/route.ts`) compared
    the *whole request's* `Content-Length` against the bare 2MB file cap, which could reject a
    legitimate ~2MB resume once its own multipart overhead was added — it now compares against a
    dedicated `MAX_RESUME_REQUEST_BYTES` (file cap + overhead allowance) instead. New tests on
    both sides cover the boundary in each direction (`tests/test_resume_router.py`'s
    `..._close_to_the_size_limit`, `tests/test_answers_router.py`'s file-size-limit tests, both
    BFF route `.test.ts` files' Content-Length boundary tests).
  - **Immediate session invalidation via `users.token_version`.** Before this, password-change
    and logout-all only revoked refresh tokens — an already-issued *access* token kept working
    until its own short TTL expired even after a reported compromise. `users.token_version`
    (migration `0008`, default `1`) is now baked into every access/refresh JWT's `ver` claim
    (`core/auth.py`'s `_encode_token`/`check_token_version`) and checked on every authenticated
    request and every refresh; password-change and logout-all both bump it
    (`repo.increment_token_version`), which rejects every previously-issued credential — the one
    used to make that very call included — on its very next use, with a distinct
    `session_invalidated` error code. See `tests/test_auth_router.py`'s
    `..._invalidates_the_access_token_used_to_...` tests.
  - **Password policy raised, with a local common-password blocklist.** New-password minimum
    raised from 8 to `NEW_PASSWORD_MIN_LENGTH = 15` characters (max 128), no composition rules
    (length, not forced character classes, per NIST SP 800-63B), spaces/unicode allowed.
    `app/core/common_passwords.py` is a small offline blocklist (not a live HIBP-style
    k-anonymity call — no credential/infra for that in this environment) checked on register and
    change-password, normalizing case/punctuation and trailing digit runs so obvious variants
    ("Password123!") are still caught. **Not done in this round:** a password-strength meter in
    the sign-in/settings UI (Phase 4's ask) — deferred to the next round alongside the rest of
    the UI/a11y work.
  - **`ProfileUpdate` and auth request schemas mirror real DB/business constraints.**
    `target_role` is now the real `Role` enum (was an arbitrary string up to 64 chars);
    `display_name`/`voice_name` gained max-lengths matching their DB columns plus whitespace
    trimming (an explicit empty/whitespace value clears the field, same as `null`);
    `refresh_token` (both `/auth/refresh` and `/auth/logout`) gained a `MAX_JWT_LENGTH` bound.
    No blanket HTML-stripping was added anywhere — free-form interview/job-description text
    still allows arbitrary punctuation/technical syntax, per this file's existing hard rules.
  - **Production-only startup checks.** New `Settings.environment` (`ENVIRONMENT`, default
    `development`) gates: `INTERNAL_PROXY_SECRET` becomes required and minimum-length-checked in
    production (previously always optional); `/docs`/`/redoc`/`/openapi.json` are disabled in
    production unless `ENABLE_API_DOCS=true`; `JWT_ALGORITHM` is validated against an HMAC-only
    allow-list (`HS256`/`HS384`/`HS512`) in every environment, not just production, since this
    project only ever signs with one shared secret. See `docs/runbook.md`'s new "Production
    config" section for what a startup `ValidationError` here means operationally.

- **Adaptive interview engine, round 1 (2026-10-02) — Phases 0–1 of the "adaptive platform"
  master prompt, plus the backend of Feature 10.** The remaining phases are *not* started — see
  "Known gaps — current" for the explicit list.
  - **Decision layer vs. LLM.** `services/adaptive_engine.py` is pure (no DB, no LLM): given the
    job's competency plan, the candidate's persistent mastery and the session history it picks
    the next *competency, level (1-5) and mode* (`coverage`/`deepen`/`diagnostic`/`fallback`).
    `services/question_orchestrator.py` turns that into a question: the free LLM follow-up (when
    probing the same competency) → a matching bank question → a generated one
    (`llm.generate_question`, capped at `MAX_GENERATED_PER_SESSION`) → any unused bank question.
    Any generation failure degrades to the bank; an AI outage never stalls an interview. Every
    served question records `competency`/`level`/`selection_reason` on `session_questions`.
  - **Interviewer styles change behaviour, not just prose.** `services/interviewer_policy.py`
    (`policy_for(style)`): start-level offset, how far difficulty moves after strong/weak answers,
    depth-probe budget per competency, whether a middling answer is pressed, plus the tone
    paragraph used in the feedback/question prompts (the feedback prompt's old hard-coded "warm
    coach" opener is gone; no style = realistic). Only fields something consumes exist;
    `hint_level`/`feedback_frequency` are defined but **not yet consumed by the UI**.
  - **Competencies.** `services/competency.py`: canonical taxonomy + alias/keyword normalization
    (`normalize_competency` — LLM-supplied names are always mapped through it), 1-5 levels, and
    the mastery maths (`update_mastery`: running average for the first attempts then a fixed
    recency weight, confidence grows with attempts, evidence nudged by difficulty).
    `CandidateCompetency` (migration 0011) is the persistent per-user/per-role mastery row,
    updated by `services/mastery.py` after every answer *before* the next question is chosen.
    `GET /v1/mastery[?role=]` exposes it (strongest/weakest need ≥2 attempts). Bank questions
    carry nullable `competency`/`level` etc.; pre-taxonomy rows are classified at runtime by
    `infer_competency` (keyword rules + `BANK_COMPETENCY_OVERRIDES` — covers all 96 seed
    questions, asserted by hand when written) and `scripts/seed.py` now stores the tag.
  - **Job targets & custom roles.** `sessions.role` is now a plain string: a preset slug or the
    slugified title of any custom role (`role_title` = display name). `services/job_service.py`
    resolves a `JobTarget` + `JobCompetency` rows (weighted plan with per-competency resume
    evidence) via one cached LLM call (`llm.analyze_job_target`, cached by a hash of
    role/JD/background); a preset role without a JD uses a static default plan; any failure falls
    back to a default plan. Custom roles borrow the HR/general bank and rely on generated
    questions. Deliberately **no separate `RoleProfile` table**: role identity = key + title +
    the job target's competency map. Focus topics boost matching competencies; resume gaps
    (`missing`/`basic`) boost priority.
  - **Language is real now.** `core/languages.py` lists only languages Whisper can transcribe
    (en/ur/hi/pa); `SessionCreate.language` is validated against it, `stt.transcribe` passes the
    session language to Whisper, prompts instruct feedback/questions in that language, and the
    web app uses the matching BCP-47 tag for live captions and TTS (both best-effort per browser).
  - **Session state.** `SessionStatus.ENDED_EARLY` + `SESSION_STATUS_TRANSITIONS`;
    `POST /v1/sessions/{id}/end` (owner-scoped, 409 if already finished) via
    `repo.transition_session_status`, whose allowed-from check lives in the UPDATE's WHERE
    clause. The web UI does not call it yet.
  - **Web.** Setup form: custom-role input, interview-language pills; `types.ts` mirrors the new
    fields; progress role filter accepts custom roles.
  - **Tests.** API 267 → 328 (`test_competency`, `test_adaptive_engine`, `test_job_service`,
    `test_question_orchestrator`, `test_adaptive_flow`); a conftest autouse fixture makes
    `llm.generate_question`/`analyze_job_target` behave like a provider outage so no test reaches
    the network and every session test also exercises the fallback path. Web 208 → 211.
    Migration 0011's first push only upgraded/downgraded/re-upgraded against SQLite, which
    doesn't model collation — real MySQL CI then caught a genuine bug (the three new tables were
    missing the `mysql_charset`/`mysql_collate` kwargs every other migration passes to
    `create_table`, so their VARCHAR keys collated differently from `users.id` and MySQL refused
    the foreign key with error 3780). Fixed in a follow-up commit and now verified green against
    CI's real MySQL 8 service, not just SQLite. No live Groq call was made for any of the new
    prompts.

- **Learning system, round 2 (2026-10-02) — Phase 2 of the adaptive-platform prompt (Features 9,
  10, 11, 14).**
  - **Re-answer (9).** `answers.attempt_number` + `original_answer_id` (migration 0012). A retry
    is a *new* row via `POST /v1/answers` with `retry_of_answer_id` (must be the caller's own
    answer to the same session question; any attempt id resolves to the root; max
    `MAX_ATTEMPTS_PER_QUESTION = 5`, mirrored in the report page). A retry never advances the
    session, never updates mastery, and is excluded from session aggregates/progress via
    `original_answer_id IS NULL` filters in `repo.py` (it *does* count toward the daily answer
    cap — it costs real STT/LLM usage). `GET /v1/answers/{id}/attempts` →
    `services/comparison.py`: improved = component up ≥1 point, still-weak = <6, focus-next =
    lowest component, filler/WPM deltas — all computed from stored scores, no LLM. Web:
    `RetryAnswer` + `AttemptComparison` on `/report/[answerId]`.
  - **Mastery page (10).** `/mastery` (nav item "Skills"): readiness card, strongest/weakest/
    biggest-risk, today's practice, per-skill bars (accessible `progressbar`s; skills with <2
    answers are visually marked "early"). `GET /v1/mastery` now includes `role` per skill.
  - **Spaced repetition (11).** `services/spaced_repetition.py`, pure: interval by mastery band
    (1/2/4/7 days, 14 once ≥90%), halved when >50% of attempts failed; due = last practice +
    interval. `GET /v1/practice-plan[?role=]` returns today's ≤3 due skills (most overdue first),
    upcoming reviews, an estimated 3 questions/9 minutes, and `focus_topics` — "Start today's
    practice" links to `/interview?role=…&count=3&topics=…`, which pre-fills the setup form's
    focus topics (the engine boosts matching competencies).
  - **Readiness (14).** `services/readiness.py` + `GET /v1/readiness?role=`: plan-weighted mean
    of mastery shrunk toward 50% by confidence, over assessed competencies only; **no score**
    (null) when <30% of the plan is assessed or <3 answers; per-category scores, drivers,
    plain-language explanation. Called the "Rehearse Readiness Score"; not a percentile and the UI
    says so. Plan = explicit/latest job target for the role, else the role's default plan.
  - **Tests.** API 328 → 348 (`test_learning_system.py`), web 211 → 221. Migration 0012
    upgrade/downgrade/upgrade verified on SQLite only. The browser recording path of
    `RetryAnswer` (MediaRecorder) is not covered by an automated test, same limitation as
    `InterviewFlow`.

- **Interview realism, round 3 (2026-10-03) — Phase 3 of the adaptive-platform prompt (Features
  2, 6, 12).**
  - **Claims ride the existing feedback call (no extra LLM call).** `LLMFeedback` gained
    optional `claims` and `consistency` lists. Every claim must carry a `quote` that really
    appears in the transcript (`services/claims.verified_claims`) — a claim the model can't quote
    is dropped, so the interviewer never probes something that wasn't said. Persisted as
    `InterviewClaim` rows (migration 0013; `answer_id` is deliberately not an FK to avoid an
    answers → session_questions → claims cycle).
  - **Claim probing (2).** `claims.choose_claim` is deterministic: style sets the minimum
    importance (supportive: high only; realistic: medium+; challenging: any), a claim is probed
    once, chains are cut at the style's depth budget, claims from the answer just given go first,
    and probes may be at most ~half the interview. `decide_next(claim=…)` takes precedence over
    everything; the orchestrator writes the question with the LLM (neutral, non-accusatory
    prompt) or falls back to a typed template quoting the candidate's own words
    (`probe_fallback_text`). Answering a probe updates the claim: strong answers raise it to
    `partially_supported` → `well_supported`; a weak answer leaves it `unverified`.
    **`contradictory` is never set automatically.** Report wording is "may receive recruiter
    follow-up". Retries never create claims.
  - **Resume consistency (12).** Same call: `consistency` notes need *both* quotes verified — the
    answer statement against the transcript, the resume statement against the candidate's
    background — or they are dropped; none are produced without a background. Shown as "Possible
    recruiter follow-up" on the report (stored in `answers.feedback["consistency_notes"]`, no new
    column). High-impact resume claims: the cached job analysis (`JobTarget.resume_claims`, quote-
    verified) is copied into each session as `source="resume"` claims (top 3 high/medium) and
    probed once the interview is under way. Side effect: any session with a background now runs
    the cached analysis, even for a preset role without a JD.
  - **Panel interviews (6)** behind `ENABLE_PANEL_INTERVIEW` (default on; `GET /v1/features`
    tells the UI, session creation returns 422 `feature_disabled` otherwise). `services/panel.py`:
    recruiter (Sam), technical lead (Alex), manager (Jordan) — simulated, fictional first names,
    labelled as such. Each *owns* competencies; on a coverage turn the engine may only pick from
    the current panelist's remit (`allowed=`), turns rotate and skip a panelist with nothing in the
    plan, follow-ups stay with whoever asked, and claim probes route by claim type. Per-panelist
    assessments (average score of the answers to their questions) appear in the session summary
    next to the overall score. `session_questions.panelist`, `sessions.panel`.
  - **Tests.** API 348 → 381 (`test_claims_and_panel.py`), web 221 → 229. Migration 0013
    upgrade/downgrade/upgrade verified on SQLite only. **No live Groq call** was made: claim/
    consistency extraction quality and the claim-probe wording are unverified against the real
    model (all behaviour tested with scripted LLM output, plus the outage fallback path).
    `InterviewFlow`'s panelist header is not covered by an automated test (same jsdom limitation
    as the rest of that component).

- **Delivery coaching, round 4 (2026-10-04) — Phase 4 of the adaptive-platform prompt (Features
  7, 8).** Delivery is reported *separately* from content; nothing here feeds the rubric,
  mastery or readiness scores.
  - **Voice/prosody (7), split by where each signal can be measured honestly.** *Server, from
    Whisper word timings already stored:* pace (with sped-up stretches over 10s windows), pause
    control (long/medium pauses), time to first word, speaking rhythm (variation in phrase
    length). *Browser, on-device:* `lib/audio/prosody.ts` (`ProsodyAccumulator`: normalised-
    autocorrelation pitch 70-400 Hz, RMS energy variation, volume steadiness) fed by
    `use-prosody-capture` from a second 2048-sample `AnalyserNode` on the same mic stream
    (`useAudioRecorder.pitchAnalyser`; the 128-sample `analyser` stays for the waveform). The
    browser sends only a ~7-number `prosody` JSON form field; the server validates every bound
    (`ProsodySummary`), drops malformed data instead of failing the answer, stores it in
    `answers.prosody`, and `services/delivery.py` turns thresholds into ratings
    (good/ok/needs_work/**not_measured**) and composed advice — never a numeric "prosody score".
    These numbers are client-supplied and unauthenticated; the report says they are measured on
    the device. Fewer than ~40 voiced frames, or untrackable pitch, reads "not measured".
  - **Camera coach (8), behind `ENABLE_CAMERA_COACH` (default off).** Real on-device analysis:
    MediaPipe `FaceLandmarker` (`@mediapipe/tasks-vision`, Apache-2.0) with the model checked in
    at `public/mediapipe/face_landmarker.task` and the WASM runtime copied from node_modules into
    the gitignored `public/mediapipe/wasm/` by `scripts/sync-mediapipe.mjs` (`predev`/`prebuild`)
    so everything loads from our own origin. `lib/camera/pose.ts` estimates head turn/tilt from
    landmark geometry (an approximation, documented as one) and summarises face-in-frame ratio,
    share of time with the head turned away, sustained look-away events (≥0.7s) and head
    movement. **No eye-contact/gaze, posture or facial-expression claims are made** — not
    reliably measurable this way, and expression would drift toward emotion inference. Opt-in per
    interview via `CameraCoachPanel` (off by default, states the privacy terms); video/frames
    never leave the device, only the 6-number `camera` summary is sent (and the API ignores it
    unless the flag is on). Shown as its own "Visual delivery" section with a disclaimer.
  - **Security headers changed deliberately:** `Permissions-Policy` is now `camera=(self)` (was
    `camera=()`), and CSP `script-src` gained `'wasm-unsafe-eval'` (WebAssembly compilation only,
    not JS eval). Nothing else loosened.
  - **Verified in a real browser** (headless Chromium, production build, fake devices): the
    camera pipeline loads the model + WASM under the app's CSP and runs at ~10 fps (the fake
    camera has no face, so presence read 0 as it should), and the mic pipeline captured frames
    and statistics from the fake audio device. **Not verified:** accuracy on a real face or real
    speech — pitch/energy thresholds are reasonable defaults checked on synthetic tones only.
  - **Tests.** API 381 → 406 (`test_delivery.py`), web 229 → ~250 (`prosody`, `pose`,
    `DeliveryCard`, `CameraCoachPanel`, report page). Migration 0014 (SQLite only).
    `InterviewFlow`'s capture wiring has no jsdom test (same limitation as the rest of it).

- **Hardening + "continue training" home (2026-10-04).**
  - **DB TLS is enforced in production.** `DATABASE_TLS` (unset = on in production, off elsewhere)
    makes `db.py` pass a verifying `ssl` context (certificate *and* hostname) to the MySQL driver
    (`Settings.database_connect_args`); `DATABASE_SSL_CA` points at a host CA bundle (Aiven needs
    one) and a bad path fails at boot rather than skipping verification. Production refuses to
    start with `DATABASE_TLS=false`. Non-MySQL URLs (the SQLite in tests) are exempt. **Not
    verified against a real TLS MySQL server** — only the settings logic and the context's
    verification flags are tested.
  - **Bug found and fixed along the way:** `POST /v1/answers` never checked the session was still
    in progress, so an ended-early (or finished) interview could still take an answer to its
    outstanding question and then generate new questions. It now returns 409 `session_not_active`
    for any new answer to a non-in-progress session; retrying an *existing* answer stays allowed.
  - **Explicit early end in the UI.** `EndInterviewButton` (two-step confirm; BFF route
    `POST /api/interview/sessions/[sessionId]/end`) on the unfinished-summary page and the
    dashboard; the summary page now says "Interview ended early" rather than implying completion.
  - **`/dashboard` (nav "Home", logo, and the default post-sign-in destination).**
    `DashboardView`: resume/end the in-progress interview or start one, readiness and today's
    practice for the role with the most practice, the three weakest skills (≥2 answers only), and
    the five most recent interviews with honest status labels. Every block is real data or an
    honest empty state; "most improved skill" is deliberately absent because per-skill history
    isn't stored. `roleLabel` (`lib/interview/role-label.ts`) replaced two duplicated helpers.
  - **Production regression fixed: the nonce CSP had broken every public page.** The nonce-based
    CSP (`src/proxy.ts`) only works on pages rendered per request, but `/`, `/sign-in` and
    `/styleguide` were statically prerendered — their scripts carried no nonce, so Chromium blocked
    all 16-17 chunks on each and none of them hydrated; `next-themes`' inline script was blocked
    too. Unit tests and `next build` can't see this; loading the production build in a real
    browser did. Fix: `RootLayout` reads `headers()` (which makes the whole app dynamic, as Next's
    CSP guide requires) and passes the proxy's `x-nonce` to `ThemeProvider`. Verified: zero CSP
    violations and every script tag matching the response nonce on `/`, `/sign-in`,
    `/styleguide`; the camera coach still loads its WASM and model under the new policy. New
    Playwright regression test in `e2e/landing.spec.ts`. Cost, as the guide warns: no static
    prerendering or CDN caching for any page.
  - **CI scanning config** (Dependabot + CodeQL) — see the CI gap entry below for what is and is
    not active yet.
  - **Tests.** API 419 → 427, web 260 → 277.

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

## Known gaps — current

- **UI review implementation (2026-09-30):** supersedes the older UI gap list below. Product
  navigation is available on mobile with current-page state and a skip link. OptionPill now
  renders native grouped radios. Setup uses labeled fields, collapsible session options,
  optional personalization, duration guidance, and preserves entries on creation failure.
  Light-theme foreground colors and primary-button fill/text roles now meet small-text
  contrast on the main surfaces. Settings compares normalized drafts to the saved API
  response, handles edits during saving, and warns before leaving with unsaved changes.
  Password inputs share reveal controls; password changes clear cookies and return to sign-in.
  Reports lead with an existing coaching improvement, collapse secondary metrics, respect
  reduced motion in transcript comparison, and provide recovery links. History has pagination
  (20 sessions per page, charts/filters explicitly page-scoped), summary links, and deletion
  failure feedback. Early exit is honestly labeled "View progress so far"; unfinished summaries
  offer Resume and do not claim completion. No new end-session mutation was introduced.
  Recording/review/upload failure states warn before navigation and retain audio on rate limits.
  `use-unsaved-changes` covers links/reload/close and same-document browser traversal where the
  Navigation API is available; browsers without it use link-click and beforeunload fallbacks.
  Audio remains in memory, never persisted by these guards.
- **Authenticated UI browser coverage now exists:** `pnpm --filter ./apps/web test:e2e:ui`
  uses a production build, an isolated local fixture API on ports 3198/3199, and Chromium's fake
  microphone. It covers both themes at 320/768/1440px, setup recovery/validation, Settings save
  feedback/navigation, history/summary resume links, and recording navigation/rate-limit retry.
  This supplements the landing suite; it does not verify live Groq or physical microphone input.
  Chromium is installed in this workspace; older notes saying no browser is available are
  historical. Cross-browser back-navigation protection, individual answer links from summaries,
  and a persisted explicit early-end state remain follow-ups requiring further UI/API work.

- **Adaptive-platform master prompt, remaining (as of 2026-10-04):** a report-page redesign
  (the report is still one long page, not the sectioned layout the prompt describes) and a
  "most improved skill" dashboard block (needs mastery-over-time history, which isn't stored).
  Also missing for what *is* built: a mastery-over-time history chart,
  per-session `SessionCompetencyState` table (session coverage is derived from `session_questions`
  + answers instead), a `RoleProfile` table, difficulty levels on the bank beyond the coarse
  easy/medium/hard mapping (levels 1 and 5 only ever come from generated questions or follow-ups),
  and consumption of `InterviewerPolicy.hint_level`/`feedback_frequency` in the interview UI.

- **Account recovery and email verification are implemented locally, but not connected to a
  transactional email provider.** Password-reset and email-verification tokens are hashed at rest,
  one-time use, rate-limited, and exposed as local dev links only when `ENVIRONMENT=development`.
  In production the endpoints deliberately do not return raw tokens; wiring an email provider is
  still required before real users can receive those links.
- **No CI/CD deploy stage or branch protection.** Needs repo-settings changes and a real GitHub
  Actions run to exercise. Dependency and static-analysis scanning is now *configured*
  (`.github/dependabot.yml`: weekly npm/pip/actions updates; `.github/workflows/codeql.yml`:
  CodeQL `security-extended` for JS/TS and Python on push, PR and weekly) but has not run yet, and
  Dependabot security updates / code-scanning alerts still have to be switched on in the
  repository's security settings.
- **No production error-tracking service** (e.g. Sentry) — needs an external account/credential
  this environment doesn't have. Request-ID correlation and structured, PII-free error logging
  *are* in place without one (see the "Observability" bullet above); a Sentry/APM integration
  would consume the same request ID rather than replace it.
- **No end-to-end browser test suite** (e.g. Playwright) exercising the real
  `MediaRecorder`/`getUserMedia`/`speechSynthesis` flow — this environment has no browser to run
  or verify one in. Everything upstream of the browser APIs (multipart forwarding, auth, cookie
  refresh, ownership checks, error propagation, the full session-orchestration and rubric-scoring
  pipeline) is covered by the API's pytest suite and the web app's Vitest/RTL suite instead.
- **Live Groq STT/LLM integration is still unverified against real credentials** — this environment
  has no `GROQ_API_KEY`. STT/LLM calls are mocked in every automated test;
  `apps/api/scripts/try_answer.py` remains the way to smoke-test the real integration.
- **The 2026-09-28 hardening pass's later phases are not started yet**, tracked separately from
  the round-1 items above so they aren't mistaken for done:
  - No passkey/WebAuthn support. Password reset and email verification now exist, but still need
    a transactional email provider before production delivery.
  - No further OWASP API Top-10 endpoint-by-endpoint re-audit beyond what already existed
    (cross-user authorization tests, idempotency, magic-byte sniffing, etc.) or Groq
    backoff/jitter hardening beyond the existing `groq_retry.py` timeout+retry-once policy.
  - No UI/UX changes yet: session-setup progressive disclosure, mobile nav, `OptionPill` →
    real radio-group semantics, light-mode semantic status-text tokens, end-interview
    confirmation, unsaved-recording navigation warning, report-page recovery links, Settings
    dirty-state tracking, or a password-strength meter.
  - CSP now uses per-request nonces for scripts through `proxy.ts`, so script-src no longer
    needs `'unsafe-inline'`. `style-src 'unsafe-inline'` remains because React/Motion dynamic
    style attributes are still used heavily. No structured-JSON-log/Sentry wiring beyond the
    existing request-ID correlation. (The DB-TLS startup check and Dependabot/CodeQL config now
    exist — see the 2026-10-04 "Continue training" entry in Status.)
  - No async job-queue redesign for answer processing (`POST answer → job_id` → polling) — not
    justified without real production latency measurements first, per that phase's own
    instructions.
  Each of these is a distinct, schedulable follow-up; none should be assumed covered by the
  round-1 work above just because "the hardening pass" ran once.
