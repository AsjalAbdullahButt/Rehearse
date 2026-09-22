# Rehearse

An AI mock interview coach. Pick a role, answer a spoken question out loud, and get transcription,
filler-word/pace/pause metrics, STAR and clarity scoring, a stronger sample answer, and progress
tracking across sessions.

> **Status:** Phase 1 (foundation) complete. See [AGENTS.md](./AGENTS.md) for stack, conventions
> and current progress.

## Stack

Next.js (App Router) + TypeScript + Tailwind v4 · FastAPI (Python 3.12, `uv`) · Supabase
(Postgres + Auth + RLS) · Groq (Whisper STT + Llama LLM). All on free tiers.

## Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io) (`npm install -g pnpm`)
- Python 3.12 and [uv](https://docs.astral.sh/uv/) (`uv python pin 3.12` is already set in
  `apps/api`)
- A [Supabase](https://supabase.com) project (free tier) and a [Groq](https://groq.com) API key

## Setup

```bash
pnpm install
```

Copy the env templates and fill in real values:

```bash
cp .env.example apps/web/.env.local   # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ...
cp .env.example apps/api/.env         # GROQ_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, ...
```

Apply the database schema and seed data to your Supabase project (via the SQL editor, or the
Supabase CLI once linked):

```
supabase/migrations/0001_init.sql
supabase/seed.sql
```

## Development

```bash
pnpm dev            # web on :3000, api on :8000, in parallel
pnpm dev:web        # web only
pnpm dev:api        # api only
```

The web app proxies `/api/py/*` to the FastAPI server in dev (see `apps/web/next.config.ts`), so
the browser never needs CORS configured locally.

Visit `/styleguide` for a live render of every design token and UI primitive in both themes.

## Quality gates

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

For the API specifically:

```bash
cd apps/api
uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest
```

Always verify with a production build before calling something done:

```bash
pnpm --filter ./apps/web build && pnpm --filter ./apps/web start
```

## Project structure

See [AGENTS.md](./AGENTS.md#folder-structure) for the full layout and the master spec for the
complete target structure.

## Deployment

Two Vercel projects (web root `apps/web`, API root `apps/api`) — details land in Phase 6.
