# CodeType Solo

**A single-player code-typing trainer with adaptive practice and AI-guarded hints.** Drill 150 NeetCode-style snippets, get per-session WPM/accuracy/weakness tracking, and let Claude coach you on weak topics on a spaced-repetition schedule.

### B1 Builders Programme — Project #1 of 2: _For individual use_

> _"A project that supports **one person's personal or work-related** needs."_

This repo is the **individual-use** submission. Companion: [`codetype-race`](../codetype-race) — the team / organisational project.

| Axis            | This (`codetype-solo`) | Companion (`codetype-race`)   |
| --------------- | ---------------------- | ----------------------------- |
| Rubric scale    | Individual use         | Team / organisational use     |
| Users           | One per install        | Many, on shared snippets      |
| Identity        | PIN-only HMAC cookie   | Signed-in handle + scrypt PIN |
| Shared resource | None                   | Snippets + leaderboards       |

---

## Overview

### Problem

- **Who:** Developers and CS students who want to type code faster without the social pressure of a leaderboard.
- **Issue:** General typing trainers use prose, not code. Symbols, indentation, and language structure — where coders slow down — are underrepresented.

### Outcome

- Single-player browser app drilling 150 NeetCode-style problems, with per-session WPM/accuracy/weakness tracking.
- Adaptive practice + SM-2 spaced repetition surface and schedule weak topics.
- AI hint endpoint with guardrails (`hint-guardrails.ts`) that refuses to leak full solutions; AI summaries recap each session.
- Runs locally on SQLite or on Vercel + Turso libSQL — no per-user account, one HMAC cookie unlocked by a PIN.

---

## Demo

To do live during interview.

**Single-user evidence:** there is no account system, no leaderboard, no shared snippet pool. Opening the app in a private window shows a fresh empty dashboard — every row in `attempts`/`topic_mastery` is owned by a single `userPseudoId`. This is the structural inverse of `codetype-race`'s multi-user demo.

---

## Technology Stack

### Frontend components

- **SvelteKit + TypeScript** — routing, server endpoints, UI.
- **CodeMirror 6** — code editor surface (syntax highlighting, char-level cursor tracking).
- **Vite** — dev server and bundler.

### Backend components

- **SvelteKit server routes** deployed as Vercel Functions via `@sveltejs/adapter-vercel`.
- **Drizzle ORM over libSQL** — local SQLite in dev, Turso in prod (commit `5b429ff`).
- **HMAC-signed session cookie** (`session.ts`, `c180601`) — 30-day TTL, constant-time PIN compare, no server-side store.
- **Anthropic Claude API** — `POST /api/hint` (`b8176e9`) and per-attempt `aiSummary` (`3c16646`), gated by `hint-guardrails.ts` (`d976a1d`).
- **SM-2 spaced repetition** — `ease`, `intervalDays`, `repetitions`, `nextReviewAt` on `topic_mastery` (`8da37cf`).

### Claude prompt guardrails

`src/lib/server/hint-guardrails.ts` validates _before_ tokens are spent and sanitises _after_:

- Pre-call regex-rejects "full solution", "ignore previous instructions", oversize questions.
- System prompt: short conceptual hints only, no full code, never reveal exact identifiers.
- Post-call: strips long fenced code blocks, truncates runaway output.
- Endpoint: in-memory rate limit per session.

---

## Development Approach with AI

| Tool           | Model               | Purpose                                                    |
| -------------- | ------------------- | ---------------------------------------------------------- |
| Claude Code    | Opus 4.7            | Primary implementer — multi-file edits, schema, guardrails |
| Anthropic API  | `claude-sonnet-4-6` | Runtime `/api/hint` and per-attempt `aiSummary`            |
| ChatGPT        | GPT-5               | Design sounding board — schema critique, spec drafts       |
| GitHub Copilot | (IDE inline)        | Small completions in components and tests                  |
| Cursor         | (mixed)             | Whole-folder refactors and renames                         |

**Agents / roles:**

- _Implementer_ (Claude Code) — scaffold, libSQL migration, HMAC cookie, guardrails.
- _Reviewer_ (GPT-5) — upstream design critique; SM-2 parameters; index hints.
- _Coach_ (Sonnet, runtime) — bounded by `hint-guardrails.ts` system prompt.

**Key prompts:**

1. _"Define a Drizzle schema for `problems`, `attempts`, `hints_used`, `topic_mastery`."_ → `0ff246f`
2. _"Swap better-sqlite3 for `@libsql/client` so the same code runs on Turso."_ → `5b429ff`
3. _"Add regexes that block full-solution hints; return a withheld-message constant."_ → `d976a1d`
4. _"Critique this schema; what indexes will I regret skipping?"_ (GPT-5) → composite index on `(userPseudoId, status)`.

**Key review points and decisions:**

- **Accepted** HMAC `expiry.sig` cookie (`c180601`) over a DB session table — chosen to stay stateless on Vercel.
- **Rejected** initial AI hint endpoint that returned full code; required guardrails (`d976a1d`) before merging `b8176e9`.
- **Accepted** SR columns (`8da37cf`) but **deferred** the scheduler UI after reviewing the SM-2 math.
- **Rejected** storing hint text verbatim in `hints_used` — privacy/cost; we store only `level` and timestamp.
- **Rejected** a Copilot completion that swallowed a `try/catch` around the libSQL client — would mask Turso auth errors.
- **Rejected** Cursor's auto-rename that touched `drizzle/` migration files — those are immutable history.

**Responsible use:** no production data, secrets, or PII pasted into AI tools. Hints rate-limited and guardrailed. Every AI diff goes through human review + `npm run check` + `npm run lint`.

---

## Installation

```bash
npm install
cp .env.example .env   # set APP_PIN and SESSION_SECRET
npm run dev
```

Local SQLite is created at `./data/codetype.db` and seeded from `data/seed-problems.json` (`f25d5e4`).

**Deploy (Vercel + Turso):**

```bash
turso db create codetype-solo
turso db show codetype-solo --url
turso db tokens create codetype-solo
DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... npx drizzle-kit push
```

Set `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `APP_PIN`, `SESSION_SECRET`, `ANTHROPIC_API_KEY` in Vercel env, then deploy.

---

## Usage

```bash
npm run dev          # dev server
npm run build        # production build
npm run check        # type-check
npm run lint         # prettier + eslint
npm run test:unit    # vitest
npm run test:e2e     # playwright
```

1. Open `/`, enter `APP_PIN` → 30-day HMAC cookie issued.
2. Pick a problem (filter by `?q=`, `?difficulty=`, `?topic=`, `?status=` — `bd11ddc`).
3. Type the snippet. WPM/accuracy update live. Request a hint (level 1–3).
4. Submit. Attempt recorded, weakness updated, streak incremented (`040b4e3`).

---

## Project Structure

```
codetype-solo/
├── src/
│   ├── routes/                    # SvelteKit routes (UI + server endpoints)
│   └── lib/server/
│       ├── db/                    # schema.ts, libSQL client
│       ├── session.ts             # HMAC cookie (c180601)
│       ├── backup.ts              # export/import (e456674)
│       └── hint-guardrails.ts     # AI guardrails (d976a1d)
├── tests/                         # Vitest + Playwright
├── docs/                          # B1 spec, design notes
├── scripts/                       # seeding + automation
├── assets/                        # screenshots, demo gif
└── data/
    ├── seed-problems.json         # 150 problems (f25d5e4)
    └── codetype.db                # local SQLite (gitignored)
```

---

## Reflection

**Worked:** Claude Code owning multi-file refactors (`5b429ff`, `e456674`) with GPT-5 as upstream reviewer kept the human in the _decision_ loop. Schema-first development (`0ff246f`) gave every later AI prompt a stable contract. Guardrailing `/api/hint` (`d976a1d`) before shipping (`b8176e9`) prevented the most obvious misuse.

**Failed:** Trying to keep `better-sqlite3` for local and wrap libSQL for prod was a leaky abstraction; the fix was `@libsql/client` everywhere (`5b429ff`). The first AI hint endpoint returned full solutions — caught in review, motivated `hint-guardrails.ts`. Cursor's rename touched migration files once; `drizzle/` now excluded from any AI rename scope.

**Changed:** Moved from a DB session table to an HMAC cookie (`c180601`) once we committed to Vercel + Turso. Added SR columns (`8da37cf`) after GPT-5's spec critique. AI summary column (`3c16646`) was added late — users wanted recap _after_ attempt rather than mid-flow hints.

**Next:** Refresh screenshots in `assets/`. Surface the SM-2 scheduler in the UI. Add a read-only demo PIN.

---

## License

MIT — see `LICENSE`.
