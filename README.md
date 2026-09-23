# Rehearse

An AI mock interview coach. Pick a role, answer a spoken question out loud, and get transcription,
filler-word/pace/pause metrics, STAR and clarity scoring, a stronger sample answer, and progress
tracking across sessions.

> **Status:** Phase 2.5 (data & auth layer) complete. See [AGENTS.md](./AGENTS.md) for stack,
> conventions and current progress.

## Stack

Next.js (App Router) + TypeScript + Tailwind v4 · FastAPI (Python 3.12, `uv`) · MySQL 8 via
SQLAlchemy 2 (async) + Alembic, with FastAPI-native JWT auth (argon2 password hashing) · Groq
(Whisper STT + Llama LLM). All on free tiers.

## Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io) (`npm install -g pnpm`)
- Python 3.12 and [uv](https://docs.astral.sh/uv/) (`uv python pin 3.12` is already set in
  `apps/api`)
- A MySQL 8 database and a [Groq](https://groq.com) API key. For local dev, run MySQL in Docker:

  ```bash
  docker run --name rehearse-mysql -e MYSQL_ROOT_PASSWORD=root \
    -e MYSQL_DATABASE=rehearse -p 3306:3306 -d mysql:8
  ```

  For a free hosted database (staging/prod), use [Aiven's free MySQL plan](https://aiven.io/free-mysql-database)
  (real MySQL 8, 1GB storage, no credit card). PlanetScale's free tier no longer exists and
  Clever Cloud dropped its free tier in 2023 — check current offers before assuming either is
  still free.

## Setup

```bash
pnpm install
```

Copy the env templates and fill in real values:

```bash
cp .env.example apps/web/.env.local   # NEXT_PUBLIC_SITE_URL, API_URL
cp .env.example apps/api/.env         # GROQ_API_KEY, DATABASE_URL, JWT_SECRET, ...
```

Generate a `JWT_SECRET`:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Apply the database schema (Alembic, replacing the old Supabase SQL editor step) and seed the
question bank:

```bash
cd apps/api
uv run alembic upgrade head
uv run python scripts/seed.py
```

## Development

```bash
pnpm dev            # web on :3000, api on :8000, in parallel
pnpm dev:web        # web only
pnpm dev:api        # api only
```

The web app proxies `/api/py/*` to the FastAPI server in dev (see `apps/web/next.config.ts`); auth
specifically goes through the Next.js route handlers under `apps/web/src/app/api/auth/*`, which
proxy to the API server-side and set the session as httpOnly cookies (never `localStorage`).

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

CI also runs `alembic upgrade head` against a real MySQL 8 service container — pytest itself runs
against an in-memory SQLite DB for speed (the models use dialect-agnostic SQLAlchemy types so this
works), so the MySQL-specific surface (utf8mb4, `CHECK` constraint enforcement) is only proven by
that CI step, not by `pytest` locally.

Always verify with a production build before calling something done:

```bash
pnpm --filter ./apps/web build && pnpm --filter ./apps/web start
cd apps/api && uv run uvicorn app.main:app
```

## Project structure

See [AGENTS.md](./AGENTS.md#folder-structure) for the full layout and the master spec for the
complete target structure.

## Deployment

Two Vercel projects (web root `apps/web`, API root `apps/api`) — details land in Phase 6. The
MySQL host is provisioned separately (Aiven or equivalent) and its connection string is set as
`DATABASE_URL` on the API project.
