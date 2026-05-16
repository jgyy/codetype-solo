# CodeType Solo

## Overview

### Problem

- **Who is affected?** Developers and CS students who want to type code faster and more accurately, and who want NeetCode-style algorithm practice without the social pressure of a leaderboard.
- **What is the issue?** General typing trainers use prose, not code. Symbols, indentation, and language structure are exactly where coders slow down — but they are underrepresented in mainstream tools. Conversely, algorithm-practice sites are cloud-only, account-gated, and rarely measure the *typing* side of fluency.

### Outcome

- A single-player browser app that drills typing on 150 NeetCode-style problems across multiple languages, with per-session WPM, accuracy, and weakness tracking.
- Adaptive practice and spaced-repetition surface the topics and characters that trip a user up, then schedule targeted drills.
- Optional AI hint endpoint with guardrails (`hint-guardrails.ts`) refuses to leak full solutions, and AI summaries (`aiSummary` on `attempts`) recap each session.
- Runs locally on SQLite or on Vercel + Turso libSQL with no per-user account — a single HMAC-signed cookie unlocked by a PIN.

---

## Demo

**Live:** https://codetype-solo.vercel.app

**Screenshots:** `assets/` contains the landing page, practice view, and dashboard captures.

**60-second walkthrough:** `assets/demo.gif` shows: enter PIN → pick a problem → type → submit → request hint → review weakness widget.

> _Screenshots and clip are committed alongside this README; replace with refreshed captures after any UI change._

---

## Technology Stack

### Frontend components

- **SvelteKit + TypeScript** — routing, server endpoints, and UI components.
- **CodeMirror 6** — code editor surface used by the typing engine (syntax highlighting, character-level cursor tracking).
- **Vite** — dev server and bundler.
- **Static rendering** for landing and marketing routes; SSR for authenticated practice routes.

### Backend components

- **SvelteKit server routes** (deployed as Vercel Functions in production via `@sveltejs/adapter-vercel`).
- **Drizzle ORM over libSQL** — local SQLite file (`./data/codetype.db`) in dev, Turso-hosted libSQL in production. See commit `5b429ff` for the better-sqlite3 → `@libsql/client` migration.
- **HMAC-signed session cookie** (`session.ts`, commit `c180601`) — `expiry.sig` token, 30-day TTL, constant-time PIN compare; no server-side session store.
- **Anthropic Claude API** — `POST /api/hint` (commit `b8176e9`) and per-attempt AI summary column (`3c16646`), gated by `hint-guardrails.ts` (commit `d976a1d`).
- **Spaced-repetition columns** on `topic_mastery` (`ease`, `intervalDays`, `repetitions`, `nextReviewAt`) — commit `8da37cf`.

---

## Development Approach with AI

This project was built primarily with AI co-developers under human review. Each tool below played a distinct role; commits and PRs are cited as evidence.

### 1. Claude Code (Opus 4.7) — primary implementer

- **Role:** Pair-programmer that wrote most of the code. Multi-file edits, refactors, and schema changes.
- **Example prompts:**
  1. *"Define a Drizzle schema for `problems`, `attempts`, `hints_used`, `topic_mastery` with inferred TS types."* → commit `0ff246f`.
  2. *"Swap better-sqlite3 for `@libsql/client` and `drizzle-orm/libsql` so the same code runs on Turso in prod."* → commit `5b429ff`.
  3. *"Add `looksLikeFullCode()` and regexes that block full-solution hints; return a withheld-message constant."* → commit `d976a1d`.
- **Review decisions:**
  1. **Accepted** the HMAC `expiry.sig` cookie design (commit `c180601`) after confirming constant-time PIN compare — chosen over a DB-backed session table to stay stateless on Vercel.
  2. **Rejected** an initial AI hint endpoint that returned full code; required guardrails (`d976a1d`) before merging `b8176e9`.
  3. **Accepted** spaced-repetition column additions (`8da37cf`) but **deferred** the scheduler UI to a later milestone after reviewing the SM-2 math.

### 2. ChatGPT / GPT-5 — design sounding board

- **Role:** Architecture review, schema critique, spec drafting before code was written.
- **Example prompts:**
  1. *"Critique this Drizzle schema for a single-player NeetCode trainer; what indexes will I regret skipping?"*
  2. *"Compare HMAC-signed cookie vs DB session table for a Vercel + Turso single-user app."*
  3. *"Draft a B1 deliverable spec for adaptive practice with SM-2 spaced repetition."* → docs/specs 013 (`b52c170`).
- **Review decisions:**
  1. **Accepted** the recommendation to add a composite index on `(userPseudoId, status)` for the attempts list query.
  2. **Rejected** a suggestion to store hint text verbatim in `hints_used` — privacy/cost concerns; we store only `level` and timestamp.
  3. **Accepted** the SM-2 ease/interval parameters as the starting point for `topic_mastery` (commit `8da37cf`).

### 3. GitHub Copilot — inline completion

- **Role:** Small completions inside Svelte components and test files; boilerplate JSDoc and import statements.
- **Example prompts (inline triggers):**
  1. *Component prop destructuring + default values in `+page.svelte` typing view.*
  2. *Vitest table-driven cases for `hint-guardrails.ts` regexes.*
  3. *Drizzle migration boilerplate triggered by typing `export const up =`.*
- **Review decisions:**
  1. **Rejected** a completion that swallowed a `try/catch` around the libSQL client — would have masked Turso auth errors.
  2. **Accepted** Copilot's filled-in Playwright selectors after verifying they matched the actual `data-testid` attributes.
  3. **Edited** suggested ESLint disables to specific rules instead of file-wide disables.

### 4. Cursor — refactor + multi-file edit

- **Role:** Used selectively for whole-folder refactors and renaming across the SvelteKit route tree.
- **Example prompts:**
  1. *"Rename `practice` → `problems` across `src/routes/**` and update all imports and tests."*
  2. *"Extract the export/import logic out of two route handlers into a shared `backup.ts` with transactional destructive replace."* → commit `e456674`.
  3. *"Walk back from today, count consecutive days with ≥1 attempt, return the streak."* → commit `040b4e3` (`page.server.ts`).
- **Review decisions:**
  1. **Accepted** the `backup.ts` extraction once the transactional boundary was verified to wrap both delete + insert.
  2. **Rejected** an automated rename that touched `drizzle/` migration files — those are immutable history.
  3. **Accepted** the streak loader (`040b4e3`) only after adding a tz-aware "today" boundary in review.

### Responsible-use notes

- No production data, secrets, or PII is ever pasted into AI tools — only schema, code, and synthetic examples.
- AI hints are rate-limited and guardrailed (`hint-guardrails.ts`) so the tool teaches rather than completes the user's work.
- Every AI-generated diff went through human read-through and at minimum `npm run check` + `npm run lint` before commit.

---

## Installation

```bash
npm install
cp .env.example .env   # then edit APP_PIN and SESSION_SECRET
npm run dev
```

Open the printed local URL (usually http://localhost:5173). The local SQLite file is created at `./data/codetype.db` on first run and seeded from `data/seed-problems.json` (commit `f25d5e4`).

### Deployment (Vercel + Turso)

This project deploys to Vercel using `@sveltejs/adapter-vercel`. Because Vercel's filesystem is ephemeral, the database lives in [Turso](https://turso.tech) (managed libSQL).

1. **Create a Turso database:**

   ```bash
   turso db create codetype-solo
   turso db show codetype-solo --url           # → libsql://...turso.io
   turso db tokens create codetype-solo        # → auth token
   ```

2. **Apply schema to Turso:**

   ```bash
   DATABASE_URL=libsql://<your-db>.turso.io \
   DATABASE_AUTH_TOKEN=<token> \
   npx drizzle-kit push
   ```

3. **Import the Vercel project** from GitHub at https://vercel.com/new and set the following Environment Variables (Production + Preview):

   | Variable              | Value                                         |
   | --------------------- | --------------------------------------------- |
   | `DATABASE_URL`        | `libsql://<your-db>.turso.io`                 |
   | `DATABASE_AUTH_TOKEN` | Turso auth token                              |
   | `APP_PIN`             | A 4–8 digit PIN                               |
   | `SESSION_SECRET`      | ≥16-char random string                        |
   | `ANTHROPIC_API_KEY`   | Required for `/api/hint` and `/api/summarize` |

4. Deploy. Preview URLs are automatic on every PR.

---

## Usage

```bash
npm run dev          # start the dev server
npm run build        # production build
npm run preview      # preview the production build
npm run check        # type-check the project
npm run lint         # prettier + eslint
npm run test:unit    # vitest unit tests
npm run test:e2e     # playwright end-to-end tests
```

**Expected behaviour:**

1. Open `/`, enter the `APP_PIN` — a 30-day HMAC cookie is issued.
2. Pick a problem from the list (filter by `?q=`, `?difficulty=`, `?topic=`, `?status=` — see commit `bd11ddc`).
3. Type the snippet. WPM and accuracy update live. Request a hint (level 1–3) at any time.
4. Submit. The attempt is recorded, weakness data is updated, and the dashboard streak (`040b4e3`) is incremented.

---

## Project Structure

```
codetype-solo/
├── README.md
├── LICENSE
├── package.json
├── drizzle.config.ts       # Drizzle Kit config — libSQL dialect
├── drizzle/                # generated migration SQL
├── src/
│   ├── routes/             # SvelteKit routes (UI + server endpoints)
│   └── lib/
│       ├── server/
│       │   ├── db/         # schema.ts, index.ts (libSQL client)
│       │   ├── session.ts  # HMAC cookie (c180601)
│       │   ├── backup.ts   # export/import (e456674)
│       │   └── hint-guardrails.ts  # AI guardrails (d976a1d)
│       └── ...             # shared modules, imported as `$lib/...`
├── tests/                  # Vitest + Playwright suites
├── docs/                   # B1 spec, design notes, ADRs
├── scripts/                # seeding + automation
├── assets/                 # screenshots, demo gif
└── data/
    ├── seed-problems.json  # 150 NeetCode-style problems (f25d5e4)
    └── codetype.db         # local SQLite (gitignored)
```

---

## Reflection

**What worked**

- Letting Claude Code own multi-file refactors (e.g., the libSQL migration `5b429ff`, the `backup.ts` extraction `e456674`) while using GPT-5 as an upstream design reviewer kept the human in the *decision* loop without micromanaging keystrokes.
- Schema-first development (commit `0ff246f`) meant every later AI prompt had a stable contract to target; AI churn dropped sharply after the schema froze.
- Guardrailing the AI hint endpoint (`d976a1d`) before shipping it (`b8176e9`) prevented the most obvious misuse — turning the trainer into an autocomplete.

**What failed**

- An early attempt to keep `better-sqlite3` for local and "wrap" libSQL for prod produced a leaky abstraction; the cleaner fix was to use `@libsql/client` everywhere (`5b429ff`). Lesson: don't let local-vs-prod parity slip even one layer.
- The first AI-suggested hint endpoint happily returned full solutions. Caught in review — became the motivation for `hint-guardrails.ts`.
- Cursor's whole-folder rename touched migration files once; we now exclude `drizzle/` from any AI rename scope.

**What changed and why**

- Moved from a DB-backed session table to an HMAC cookie (`c180601`) once we committed to Vercel + Turso — the original design assumed a writable local FS.
- Added spaced-repetition columns (`8da37cf`) after GPT-5's spec critique; deferred the matching UI to the next milestone to keep this README's scope honest.
- AI summary column (`3c16646`) was added late, after observing that users wanted a recap *after* the attempt rather than mid-flow hints.

**For the next iteration**

- Replace placeholder screenshots in `assets/` with refreshed captures once the new dashboard ships.
- Expose the SM-2 scheduler in the UI (currently only stored, not surfaced).
- Add a public read-only demo PIN for reviewers.
