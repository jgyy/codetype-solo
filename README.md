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

_Coming soon — screenshots and a short clip will be added once the typing view ships._

---

## Technology Stack

### Frontend components

- SvelteKit + TypeScript (UI, routing)
- Vite (dev server, bundling)
- Static rendering for the landing and practice pages

### Backend components

- SvelteKit server routes for any future API endpoints
- Local-first data: practice history and weakness metrics live in the browser (IndexedDB / localStorage) for the solo use case

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
npm run dev
```

Open the printed local URL (usually http://localhost:5173).

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
