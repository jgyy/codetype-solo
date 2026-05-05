# CodeType Solo — Project Plan (P1: Individual Use)

**Programme:** B1 Builders — Project 1 of 2
**Submission deadline:** 15 May 2026
**Target build window:** ~3–4 days

---

## Concept

A daily code-snippet typing trainer for a single developer. User picks a language, types real code snippets against the clock, gets WPM/accuracy/error stats, and tracks streaks and progress over time.

**Why it qualifies as "individual use":** state is per-user (stats, streaks, settings). No shared resources. No multiplayer.

**Why it's a real personal tool, not a toy:** developers who type slowly waste real hours. Practising on actual code (not lorem ipsum) builds muscle memory for the symbols devs actually hit (`{`, `=>`, `::`, etc.).

---

## Stack

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Backend:** Next.js Route Handlers + Supabase (Postgres + Auth)
- **Auth:** Supabase email magic link (optional — guest mode also works)
- **Charts:** Recharts (stats over time)
- **Deploy:** Vercel
- **AI tool:** opencode

---

## Core features (must-have for submission)

1. **Snippet runner** — fetch a snippet, type it, live diff highlighting (correct char = green, wrong = red).
2. **Per-attempt stats** — WPM, accuracy %, time, error count, per-character timing.
3. **Daily challenge** — same snippet for all users on a given UTC date (seeded by date).
4. **Personal history** — list of past attempts with sortable columns.
5. **Streak counter** — consecutive days with at least one completed attempt.
6. **Stats dashboard** — line chart of WPM over time, accuracy distribution, weakest characters.
7. **Language picker** — JavaScript, Python, C, Go (start with 4; ~30 snippets each).

## Stretch (only if ahead of schedule)

- Spaced-repetition queue for snippets the user typed slowly.
- Custom snippet upload (paste your own code).
- Keyboard heatmap showing finger-to-key error rate.

---

## Data model (Supabase / Postgres)

```sql
profiles      (id uuid pk, email text, created_at)
snippets      (id uuid pk, language text, title text, code text, difficulty int)
attempts      (id uuid pk, user_id fk, snippet_id fk, wpm float, accuracy float,
               errors int, duration_ms int, completed_at)
daily_seeds   (date date pk, snippet_id fk)   -- precomputed daily challenge
```

RLS: a user can only read/write their own `attempts` and `profiles` row.

---

## Folder structure (matches B1 spec)

```
codetype-solo/
├── README.md
├── LICENSE
├── .gitignore
├── package.json
├── src/
│   ├── app/                # Next.js App Router pages
│   ├── components/         # UI components (shadcn + custom)
│   ├── lib/                # supabase client, helpers
│   └── server/             # route handlers, server actions
├── tests/                  # vitest unit + playwright e2e (smoke only)
├── docs/
│   ├── ai-log.md           # prompt log + decision log (B1 deliverable)
│   └── architecture.md
├── scripts/
│   └── seed-snippets.ts    # populate snippets table
├── assets/                 # screenshots, demo gif
└── data/
    └── snippets/           # raw .json files per language
```

---

## Build sequence (4 days)

| Day | Goal | Deliverable |
|---|---|---|
| 1 | Scaffold + auth + DB schema | Project boots, can sign in, empty dashboard renders |
| 2 | Core typing engine | Can complete a snippet, WPM/accuracy computed correctly |
| 3 | History + daily + streaks | Full game loop persisted; daily challenge works |
| 4 | Polish + dashboard charts + README + deploy | Shippable demo on Vercel |

---

## AI workflow plan (for `docs/ai-log.md`)

I'll log, per session:

- **Prompts that worked** — kept as-is in final code.
- **Prompts that failed** — what the AI got wrong and the human-side correction.
- **Review decisions** — moments I rejected AI output and why (e.g., AI suggested storing per-keystroke timing in localStorage; rejected because it doesn't sync across devices; moved to Postgres jsonb column).
- **Tools used:** opencode for code gen + refactor; manually verified all DB schema and security rules.

This directly answers the README rubric (lines 117–119 of the programme doc): "List of key prompts used" and "List of key review points and the corresponding decision made."

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Typing engine perf janky on long snippets | Cap snippets at 400 chars; use uncontrolled input + ref |
| Stats computation off-by-one (common in WPM) | Write unit tests for WPM calc *first* (TDD on this module only) |
| Supabase auth flow eats half a day | Have a "guest mode" fallback that uses localStorage so the demo still works without auth |
| Scope creep on charts | One chart only (WPM over time); skip the rest unless Day 4 is free |

---

## Demo storyline (for interview)

1. Land on home → click "Start daily challenge."
2. Type the snippet → see live red/green feedback → finish.
3. Result screen: WPM 64, accuracy 96%, streak now 3 days.
4. Open History → sortable table.
5. Open Dashboard → chart showing improvement over a week.
6. Switch language → start a fresh attempt.

Total demo time: ~2 minutes. Aim for a 30-second GIF in the README.
