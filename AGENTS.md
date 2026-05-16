# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, Copilot, etc.) working in this repo.

## Project snapshot

- **Name:** CodeType Solo — single-player browser typing trainer that uses real code snippets.
- **Stack:** SvelteKit + TypeScript, Vite, Vitest (unit), Playwright (E2E), ESLint, Prettier.
- **Runtime:** Node (see `.nvmrc` if present, otherwise current LTS). Package manager: `npm`.
- **Data model:** Local-first — practice history and weakness metrics live in the browser. No backend DB yet.

## Repo layout

```
src/          SvelteKit app (routes/, lib/)
src/lib/      Shared modules, imported as `$lib/...`
tests/        Extra test suites beyond src/**
docs/         Spec and design notes (see docs/B1-Builders-Programme.md)
scripts/      Automation / utility scripts
assets/       Images, media, screenshots
data/         Snippet corpora and seed data
```

## Commands you will actually run

```bash
npm install
npm run dev          # vite dev server
npm run build        # production build
npm run preview      # serve the production build
npm run check        # svelte-kit sync + svelte-check (typecheck)
npm run lint         # prettier --check + eslint
npm run format       # prettier --write
npm run test:unit    # vitest
npm run test:e2e     # playwright (installs browsers on first run)
npm test             # unit + e2e
```

## Definition of done (every change)

1. `npm run check` — 0 errors, 0 warnings.
2. `npm run lint` — clean.
3. If you touched logic: relevant `test:unit` (or `test:e2e`) added or updated, and passing.
4. If you touched UI: manually open the affected page in `npm run dev` and confirm it renders.

Do not claim a task is done without running these. Paste the tail of the output when reporting back.

## Conventions

- **Language:** TypeScript everywhere. No `any` unless justified in a comment.
- **Imports:** Use the `$lib` alias for anything under `src/lib/`. Do not reach into `src/lib` with relative paths from routes.
- **Svelte 5:** Use runes (`$state`, `$derived`, `$effect`, `$props`) for new components. Always supply a key in `{#each}` blocks — ESLint enforces this.
- **Styling:** Component-scoped `<style>` blocks. No global CSS framework yet; if you want one, propose it before adding.
- **Formatting:** Prettier owns formatting — don't hand-tune whitespace. Run `npm run format` before committing.
- **Tests:** Co-locate unit tests next to the source as `*.test.ts` / `*.svelte.test.ts`. E2E tests live in `e2e/` (Playwright default) or `tests/`.
- **Comments:** Only when the _why_ is non-obvious. No "this function does X" prose — the name should do that.

## Workflow expectations

- Prefer editing existing files over creating new ones.
- Don't add features, abstractions, or fallbacks that weren't requested.
- For non-trivial work, write a short plan first and get human sign-off before coding.
- Match the scope of the task — a bugfix is not a refactoring license.
- When you finish, summarize what changed in 1–2 sentences. The diff speaks for itself.

## Git

- Branch from `main`. Small, focused commits.
- **No `Co-Authored-By: Claude` trailer** in commit messages.
- Don't push or open PRs unless explicitly asked.
- Never use `--no-verify` or force-push to `main`.

## Out of scope (ask first)

- Adding a backend service, database, or auth.
- Bringing in a UI/CSS framework (Tailwind, Skeleton, etc.).
- Switching package manager or bundler.
- Anything touching `docs/B1-Builders-Programme.md` — that's an external spec.

## Context for AI work

This repo is one of two AI-assisted projects submitted for the 42 Singapore B1 Builders Programme (see `docs/B1-Builders-Programme.md`). The `README.md` follows the B1-required section structure; preserve those headings when editing.
