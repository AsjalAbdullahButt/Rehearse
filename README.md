# 🎤 Rehearse

**Rehearse** is an AI-powered mock interview coach. Pick a role, run a full multi-question mock
interview, answer each spoken question out loud, and get instant, code-computed feedback — not
vague AI guesses — on how you sounded and what to improve.

> **Status:** the full product loop is live end to end — sign up → server-orchestrated
> multi-question interview → category-specific scoring → progress tracking → settings (including
> resume-based personalization). See [AGENTS.md](./AGENTS.md) for conventions, the full tech
> stack, and a detailed history of what's shipped.

---

## ✨ What it does

- 🗂️ **Runs a full multi-question interview, not a single Q&A.** Pick a role, difficulty, and
  question count (5 / 10 / 15) — the server picks each question in turn, round-robining across
  behavioral / technical / situational categories so the session actually feels like an
  interview.
- 🧑‍💼 **Personalizes itself** to a company, job description, or your own background/skills —
  typed in by hand, or pre-filled instantly from an uploaded résumé (parsed once, remembered for
  next time).
- 🎙️ **Speaks each question out loud** and records your spoken answer straight from the browser
  mic, with a live waveform and a countdown you can actually see.
- 📝 **Transcribes your answer** with Groq Whisper (verbatim, filler words included on purpose —
  that's the point).
- 🧮 **Scores it with real metrics, not vibes** — filler-word count, words-per-minute pace, long
  pauses, and rambling detection are all computed in code
  (`apps/api/app/services/metrics.py`), never guessed by an LLM.
- ⭐ **Grades each answer on a rubric that fits its category** — STAR for behavioral,
  correctness/depth/communication for technical, a situational rubric for the rest — plus a
  stronger sample answer, with every quoted piece of evidence checked against the real transcript
  before it's shown to you.
- 📈 **Tracks progress across sessions** — score trends, per-category breakdowns, filler rate, and
  pace, charted over time, with an honest empty state for a brand-new account (no fake demo
  numbers, ever).
- 🔒 **Keeps your data yours** — every session/answer/profile read or write is scoped to your user
  ID, raw audio is transcribed in memory and never stored, and Settings tells you in plain
  language exactly what's kept and where it goes.

## 🧠 How it works

A session is a loop, not a single round-trip — the server drives it question by question until
the count you picked is reached:

```text
🎯 Pick a role, difficulty & question count  (optionally: company, résumé, focus area)
        │
        ▼
🗂️  Server starts a session and picks question #1
        │
        ▼
      ┌─────────────────────────────────────────────┐
      │ 🔊 Question is read aloud (speechSynthesis)   │
      │        │                                      │
      │        ▼                                      │
      │ 🎙️  You answer out loud                       │
      │     (MediaRecorder + live waveform)           │
      │        │                                      │
      │        ▼                                      │
      │ 📝 Groq Whisper transcribes the recording      │
      │        │                                      │
      │        ▼                                      │
      │ 🧮 Filler / pace / pause metrics — pure code   │
      │        │                                      │
      │        ▼                                      │
      │ ⭐ Groq scores the *right* rubric for the       │
      │    question's category + writes a sample      │
      │    answer (evidence quotes verified against    │
      │    the real transcript)                        │
      │        │                                      │
      │        ▼                                      │
      │ 📊 Per-answer report                           │
      │        │                                      │
      │        └──── more questions left? ──► loop ───┘
        │
        ▼  (all questions answered)
🏁 Session summary — weakest category called out,
   with a one-click "practice this weak area" link
        │
        ▼
📈 Rolls into your /progress trend charts
```

## 🛠️ Tech stack

| Layer | Technology |
| --- | --- |
| 🖥️ Frontend | ⚛️ Next.js (App Router, React 19) · 🟦 TypeScript (strict) · 🎨 Tailwind CSS v4 · 🎞️ Motion + Lenis |
| ⚙️ Backend | 🐍 FastAPI (Python 3.12) · 📦 managed with `uv` · fully type-hinted, `pyright` strict |
| 🗄️ Database | 🐬 MySQL 8 (utf8mb4) · SQLAlchemy 2 (async) · Alembic migrations |
| 🔐 Auth | 🔑 FastAPI-native JWT (short-lived access + rotating refresh tokens, immediate revocation on password change) · Argon2 password hashing |
| 🤖 AI | 🚀 Groq — Whisper Large v3 Turbo (STT) + an env-configurable Groq LLM (`GROQ_LLM_MODEL`, JSON mode + Pydantic validation) |
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
(real MySQL 8, 1GB storage, no credit card required). SQLite also works for quick local
experiments (`DATABASE_URL=sqlite+aiosqlite:///./rehearse_dev.db`) — Alembic and the test suite
both support it, but MySQL is what production actually runs.

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

Generate a `JWT_SECRET` (32+ characters — the API refuses to start with anything shorter):

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Apply the database schema and seed the question bank (96 questions across 8 roles — skip this and
every role shows "No questions are available for that role yet"):

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
3. 🎤 Sign in, go to `/interview`, pick a role, and run a real multi-question mock interview end
   to end (needs a real `GROQ_API_KEY` — with a placeholder key it fails cleanly with a 502 once
   you submit a recording, which is expected).
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

---

## 🐛 Found a bug or have an idea?

Before opening one, please take a minute to check the
[existing issues](https://github.com/AsjalAbdullahButt/Rehearse/issues) — someone may have
already reported it.

When you do [open a new issue](https://github.com/AsjalAbdullahButt/Rehearse/issues/new), a
little detail goes a long way:

- **🐞 Bug report** — what you did, what you expected, what actually happened, and (if it's a
  UI bug) a screenshot or screen recording. Include your OS/browser and whether it reproduces on
  a clean `pnpm install` + fresh database, since a few known gaps are already tracked in
  [AGENTS.md's "Known gaps"](./AGENTS.md#known-gaps--current) section — worth a quick check first.
- **✨ Feature request** — the problem you're trying to solve, not just the solution you have in
  mind. "I want X because Y" beats "add X" every time — it leaves room for a better idea than the
  one you walked in with.
- **🔒 Security issue** — please **do not** open a public issue for anything that looks like a
  real vulnerability (auth bypass, data leak, injection, etc.). Reach out privately first so it
  can be fixed before it's public knowledge.

## 🤝 Contributing

Contributions are genuinely welcome — whether that's a one-line fix or a new feature. Here's the
flow:

1. **🍴 Fork** the repo and **clone** your fork.
2. **🌿 Branch** off `main` with a name that says what it does:
   `git checkout -b fix/report-page-crash` or `feat/add-linkedin-oauth`.
3. **📖 Read [AGENTS.md](./AGENTS.md) first.** It's the single source of truth for this repo's
   conventions — stack choices, hard rules (no `any`, no duplicate logic, strict typing, every
   DB query scoped to `user_id`, etc.), and folder structure. A PR that goes against something
   documented there will just bounce back with a link to it, so it saves everyone time to read
   it up front.
4. **🔨 Make your change**, keeping it scoped to the problem at hand — this project deliberately
   avoids speculative abstractions and drive-by refactors bundled into unrelated fixes.
5. **✅ Run the quality gate before opening a PR:**

   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```

   For backend changes, also run the real correctness check:

   ```bash
   cd apps/api
   uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest
   ```

   For any frontend change, confirm it in a real production build
   (`next build && next start`), not just `next dev` — this codebase has shipped more than one
   dev-mode-only bug that a production build would have caught immediately.
6. **📝 Commit** with a message that explains *why*, not just *what* (the diff already shows
   what changed).
7. **🚀 Open a pull request** against `main`, describing:
   - What problem it solves / what it adds.
   - How you tested it (automated tests, manual steps, screenshots for UI changes).
   - Anything you deliberately left out of scope, and why.
8. 🔁 Expect a review pass — small, focused PRs get reviewed and merged far faster than large
   ones that touch a dozen unrelated files.

**New here and not sure where to start?** Check the
["Known gaps" sections in AGENTS.md](./AGENTS.md#known-gaps--current) — they're an honest,
up-to-date list of what's deliberately unfinished and why, which usually makes for a much easier
first contribution than guessing at what might be missing.

---

<p align="center">Made with 🎯 focus and 🧪 a lot of testing — happy rehearsing!</p>
