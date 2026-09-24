# 🎤 Rehearse

**Rehearse** is an AI-powered mock interview coach. Pick a role, answer a spoken interview
question out loud, and get instant, code-computed feedback — not vague AI guesses — on how you
sounded and what to improve.

> **Status:** Phase 5 (progress, settings, polish) complete — the full product loop (sign up →
> interview → report → progress → settings) works end to end. See [AGENTS.md](./AGENTS.md) for
> conventions and detailed phase-by-phase progress.

---

## ✨ What it does

- 🎙️ **Speaks a real interview question out loud** for a chosen role and difficulty, then records
  your spoken answer straight from the browser mic.
- 📝 **Transcribes your answer** with Groq Whisper (verbatim, filler words included on purpose).
- 📊 **Scores it with real metrics, not vibes** — filler-word count, words-per-minute pace, long
  pauses, and rambling detection are all computed in code (`apps/api/app/services/metrics.py`),
  never guessed by an LLM.
- ⭐ **Grades STAR structure and clarity** and generates a stronger sample answer plus a
  follow-up question, via Groq Llama with strict JSON-schema validation.
- 📈 **Tracks progress across sessions** — average pace, fillers, clarity and STAR score per
  interview session, with an honest empty state for a brand-new account (no fake demo numbers).
- 🔒 **Keeps your data yours** — every session/answer/profile read or write is scoped to your
  user ID; raw audio is transcribed in memory and never stored.

## 🧠 How it works

```text
🎯 Pick a role & difficulty
        │
        ▼
🔊 Question is read aloud (speechSynthesis)
        │
        ▼
🎙️ You answer out loud (MediaRecorder + live waveform)
        │
        ▼
📝 Groq Whisper transcribes the recording
        │
        ▼
🧮 Filler/pace/pause metrics computed in code
        │
        ▼
⭐ Groq Llama scores STAR + clarity, writes a sample answer
        │
        ▼
📊 Full report + progress history
```

## 🛠️ Tech stack

| Layer | Technology |
| --- | --- |
| 🖥️ Frontend | ⚛️ Next.js (App Router, React 19) · 🟦 TypeScript (strict) · 🎨 Tailwind CSS v4 · 🎞️ Motion + Lenis |
| ⚙️ Backend | 🐍 FastAPI (Python 3.12) · 📦 managed with `uv` · fully type-hinted, `pyright` strict |
| 🗄️ Database | 🐬 MySQL 8 (utf8mb4) · SQLAlchemy 2 (async) · Alembic migrations |
| 🔐 Auth | 🔑 FastAPI-native JWT (short-lived access + rotating refresh tokens) · Argon2 password hashing |
| 🤖 AI | 🚀 Groq — Whisper Large v3 Turbo (STT) + Llama 3.3 70B (feedback, JSON-mode) |
| 🧰 Monorepo | 📦 pnpm workspaces (`apps/web`, `apps/api`) |
| ☁️ Hosting | ▲ Vercel (serverless, both apps) · 🆓 free tiers only (Groq, Vercel Hobby, Aiven MySQL) |

---

## 📋 Prerequisites

- 🟢 Node.js 20+ and [pnpm](https://pnpm.io) → `npm install -g pnpm`
- 🐍 Python 3.12 and [uv](https://docs.astral.sh/uv/) (already pinned in `apps/api`)
- 🐬 A MySQL 8 database and a 🚀 [Groq](https://groq.com) API key

Run MySQL locally with Docker:

```bash
docker run --name rehearse-mysql -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=rehearse -p 3306:3306 -d mysql:8
```

For a free hosted database, use [Aiven's free MySQL plan](https://aiven.io/free-mysql-database)
(real MySQL 8, 1GB storage, no credit card required).

## ⚙️ Setup

Install dependencies for both apps:

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

Apply the database schema and seed the question bank (96 questions across 8 roles):

```bash
cd apps/api
uv run alembic upgrade head
uv run python scripts/seed.py
```

## 🚀 Running it

From the repo root:

```bash
pnpm dev            # 🌐 web on :3000 + ⚙️ api on :8000, in parallel
pnpm dev:web        # 🌐 web only
pnpm dev:api        # ⚙️ api only
```

Then:

1. 🌐 Open `http://localhost:3000` and create an account.
2. 🎨 Visit `/styleguide` to see every design token and UI primitive in both light/dark themes.
3. 🎤 Sign in, go to `/interview`, pick a role, and run a real mock interview end to end (needs a
   real `GROQ_API_KEY` — with a placeholder key it fails cleanly with a 502 once you submit a
   recording, which is expected).
4. 📈 Check `/progress` and ⚙️ `/settings` — these work without a Groq key at all.

Want to test just the answer pipeline (STT → metrics → LLM feedback) without the browser?

```bash
cd apps/api
uv run python scripts/try_answer.py path/to/answer.webm --role backend --difficulty medium
```

## 🧪 Quality gates

Run everything at once from the repo root:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Or just the API:

```bash
cd apps/api
uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest
```

Always confirm with a real production build before calling something done:

```bash
pnpm --filter ./apps/web build && pnpm --filter ./apps/web start
cd apps/api && uv run uvicorn app.main:app
```

## 📁 Project structure

```text
rehearse/
├── apps/
│   ├── web/     🌐 Next.js frontend (App Router, TypeScript, Tailwind v4)
│   └── api/     ⚙️ FastAPI backend (Python 3.12, SQLAlchemy 2, Alembic)
├── docs/
│   └── runbook.md   🚨 incident runbook (API/DB/Groq/auth troubleshooting)
└── AGENTS.md    📖 conventions, stack details, phase-by-phase status
```

See [AGENTS.md](./AGENTS.md#folder-structure) for the full folder-by-folder breakdown.

## ☁️ Deployment

Two Vercel projects — one per app (`apps/web`, `apps/api`). The MySQL database is hosted
separately (e.g. Aiven), with its connection string set as `DATABASE_URL` on the API project.
See [docs/runbook.md](./docs/runbook.md) for what to check first if something goes wrong in
production.
