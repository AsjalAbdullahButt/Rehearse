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
- **Auth/DB:** Supabase (Postgres + Auth + RLS) via `@supabase/ssr`
- **STT/LLM:** Groq (`whisper-large-v3-turbo`, Llama via JSON mode + Pydantic validation)
- **Free tiers only:** Vercel Hobby, Supabase Free, Groq free API

## Hard rules

- TypeScript `strict`. No `any`, no `@ts-ignore`, no unused code, no leftover `console.log`
  (ESLint's `no-console` allows `warn`/`error` only).
- Python fully type-hinted, `pyright` strict mode on `app/`/`api/` (tests dir is relaxed for
  third-party stub gaps — see `apps/api/pyproject.toml`). Every LLM output is validated with
  Pydantic; the LLM never emits filler counts, WPM, or pauses — those are computed in code
  (`apps/api/app/services/metrics.py`, arriving in Phase 3).
- Secrets only in env vars, validated at startup: `apps/web/src/lib/env.ts` (zod) and
  `apps/api/app/core/config.py` (pydantic-settings). Never commit `.env`/`.env.local`.
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
- `apps/web/src/lib/{env,motion,utils,supabase/}` — env validation, shared motion tokens, `cn()`,
  Supabase client/server/middleware helpers.
- `apps/api/app/{core,routers,schemas,services,prompts}` — `core` has config/errors/logging
  (auth + rate_limit land in Phase 3 alongside Supabase JWT verification); `routers` are thin,
  `services` hold the STT/metrics/LLM/feedback/repo logic.
- `apps/api/api/index.py` — Vercel entry point (`from app.main import app`).
- `supabase/migrations/0001_init.sql` + `supabase/seed.sql` — schema, RLS policies, and the
  96-question seed bank (12 per role × 8 roles).

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
- **Phases 3–6:** not started. See the master spec for scope.

## Known gaps / deliberate scope cuts from Phase 2

- **No design mockup files, still.** `/design` was empty; Phase 2 was built from a dark-mode PDF
  (`Landing.pdf`, pasted in chat) plus written review notes, not the `landing-dark/Main.dc.html`
  export the master spec expects. Values were extracted by eye from the PDF, not read out of
  inline styles — treat them as close, not pixel-exact.
- **No light-mode mockup.** `.light` in `globals.css` is still the spec's documented fallback,
  unverified against a real design.
- **`/interview` and `/sign-in` don't exist as real product pages yet** (that's Phase 4). The nav's
  "Sign in" link points at a minimal honest placeholder (`app/(auth)/sign-in/page.tsx`) so it
  isn't a dead link. Both hero and final CTAs currently smooth-scroll to `#roles` instead of
  navigating away, for the same reason — role cards are informational only, not yet clickable.
  `MicOrb`'s shared-element setup is ready for Phase 4 but unused until a second route exists.
- **GitHub footer link** points at this repo's own real remote
  (`github.com/AsjalAbdullahButt/Rehearse`); no LinkedIn link was added since no real profile URL
  was available and the rules here forbid inventing one.
