# CodeType Solo

## Overview

### Problem

- **Who is affected?** Developers and CS students who want to type code faster and more accurately.
- **What is the issue?** General typing trainers use prose, not code. Symbols, indentation, and language structure are exactly where coders slow down — but they are underrepresented in mainstream tools.

### Outcome

- A single-player browser app that drills typing on real code snippets across multiple languages.
- Tracks per-session WPM, accuracy, and the specific characters / tokens that trip the user up, then surfaces targeted drills.

---

## Demo

**Live:** https://codetype-solo.vercel.app _(replace with your deployment URL once provisioned)_

_Screenshots and a short clip will be added once the typing view ships._

---

## Technology Stack

### Frontend components

- SvelteKit + TypeScript (UI, routing)
- Vite (dev server, bundling)
- Static rendering for the landing and practice pages

### Backend components

- SvelteKit server routes (deployed as Vercel Functions in production)
- Drizzle ORM over libSQL — local SQLite file in dev, Turso-hosted libSQL in production
- HMAC-signed session cookie (no server-side session store)

---

## Development Approach with AI

- **Tools and models:** Claude Code (Opus 4.7) as primary co-developer for scaffolding, code generation, and refactors.
- **Agents and roles:** A single planning/implementation agent paired with the human reviewer.
- **Key prompts:** Project scaffold, B1 README compliance, typing engine design (to follow).
- **Review points:** Each milestone gated on `npm run check` + `npm run lint` passing; UX decisions reviewed manually.

---

## Installation

```bash
npm install
cp .env.example .env   # then edit APP_PIN and SESSION_SECRET
npm run dev
```

Open the printed local URL (usually http://localhost:5173). The local SQLite file is created at `./data/codetype.db` on first run.

---

## Deployment (Vercel)

This project deploys to Vercel using `@sveltejs/adapter-vercel`. Because Vercel's filesystem is ephemeral, the database lives in [Turso](https://turso.tech) (managed libSQL).

### One-time setup

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

---

## Project Structure

```
codetype-solo/
├── README.md
├── LICENSE
├── package.json
├── src/         # SvelteKit app (routes, lib, components)
│   └── lib/     # shared modules, imported as `$lib/...`
├── tests/       # additional test suites beyond src/**
├── docs/        # extended documentation (B1 spec, design notes)
├── scripts/     # automation and utility scripts
├── assets/      # images, media, screenshots
└── data/        # snippet corpora and seed data
```

---

## Reflection

- _To be filled in as the project progresses — what worked, what failed, what changed, and why._
