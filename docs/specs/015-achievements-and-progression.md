---
status: Draft
author: -
created: 2026-05-08
updated: 2026-05-08
supersedes: -
superseded-by: -
---

# 015 — Achievements & progression

## Summary

A small **achievements** system: declarative achievement definitions, an event-driven projector that grants them on qualifying state transitions (spec 011), and a per-user achievements page. Achievements are the lightest possible progression layer — no XP, no levels, just unlockable badges that reward specific behaviours (first 60-WPM run; 7-day streak; first JS+Go+Py+C all completed; first cheat-clean leaderboard entry).

## Motivation

Streaks alone are a fragile habit loop — break a streak once and motivation craters. Achievements give the user a wider set of *small wins*, which research and product practice both agree is a more durable engagement signal. They're also a low-risk first consumer of the spec 011 event pipeline; if achievements break, nothing user-visible breaks.

The system has to be **declarative**: the cost of adding "type 100 attempts in Go" must be one new file in `data/`, not a code change.

## Goals

- Achievements defined as **data**, not code: one record per achievement in `data/achievements/*.ts`, validated by Zod.
- Granted by an idempotent **projector** consuming domain events; never granted from inside a request handler.
- Backfill-safe: replaying the event log over an existing user produces the same set of achievements as live granting (spec 011's replay script).
- Visible: a profile page lists earned + locked achievements with progress bars where measurable.

## Non-goals

- No leaderboards of achievements ("most achievements"). Solitary, not competitive.
- No timed/seasonal achievements yet. Static set; revisit if the product demands.
- No achievement-gated features. Cosmetic only.

## Design

### Achievement definition shape

```ts
// shared/src/achievements/types.ts
export type AchievementDef = {
  id: string;                                 // stable id, kebab-case
  title: string;
  description: string;
  icon: string;                               // lucide icon name
  hidden?: boolean;                           // hidden until earned
  // declarative trigger:
  on: DomainEventType;                        // which event class evaluates it
  // pure predicate over (event, derived stats); receives a snapshot, not the table
  predicate: (e: DomainEvent, stats: UserStats) => boolean;
  // optional progress hint for the UI
  progress?: (stats: UserStats) => { value: number; goal: number };
};
```

Achievement definitions are pure functions of `(event, stats)`. The projector computes `stats` cheaply by reading the user's profile + a small rolling counters object — no full history scan.

### Storage

Per-user earned items live in the user partition:

| field | value |
|---|---|
| PK | `USER#<sub>` |
| SK | `ACHIEVEMENT#<id>` |
| entity | `ACHIEVEMENT` |
| earned_at | ISO |
| context | small object (e.g. attempt id that triggered) |

Idempotency: `attribute_not_exists(SK)` on Put → re-delivery of the same event is a no-op.

Per-user **rolling counters** live on PROFILE under `counters`:

```ts
type Counters = {
  total_attempts: number;
  total_attempts_by_lang: Record<Language, number>;
  best_wpm_by_lang: Record<Language, number>;
  current_streak: number;
  longest_streak: number;
  daily_completed_count: number;
  cheat_clean_attempts: number;
  // ...
};
```

Counters are updated by the same projector and act as the `stats` argument to predicates. They make achievement evaluation O(1) regardless of history size.

### Projector

```ts
// api/src/events/projectors/achievements.ts
export const achievementsProjector: Projector = {
  name: "achievements",
  handles: ["AttemptRecorded", "ProfileUpdated"],
  async handle(event, ctx) {
    const stats = await ctx.profile.counters(event.sub);
    const next = updateCounters(stats, event);                // pure
    await ctx.profile.putCounters(event.sub, next);            // conditional on prev version
    for (const def of ALL_ACHIEVEMENTS.filter(a => a.on === event.type)) {
      if (def.predicate(event, next)) {
        await ctx.achievements.grant(event.sub, def.id, event); // idempotent
      }
    }
    return ok(undefined);
  },
};
```

`putCounters` uses optimistic concurrency: read counters with `version`, write back with `ConditionExpression: version = :prev`. On mismatch, retry once; if it still fails, log + drop (the projector will see the next event and reconverge).

### Example achievements (initial set)

| id | title | predicate sketch |
|---|---|---|
| `first-attempt` | "Hello, World" | event.type==AttemptRecorded && stats.total_attempts==1 |
| `60-wpm-club` | "60 WPM Club" | event.wpm_scaled >= 60 && first time |
| `polyglot` | "Polyglot" | every Language has stats.total_attempts_by_lang[L] >= 1 |
| `streak-7` | "Week On" | stats.current_streak >= 7 |
| `streak-30` | "Month On" | stats.current_streak >= 30 |
| `cheat-clean-100` | "By the Book" | stats.cheat_clean_attempts >= 100 |
| `daily-30` | "Daily Habit" | stats.daily_completed_count >= 30 |
| `first-leaderboard` | "Top of the Charts" | event is LeaderboardEntered (future) |
| `submission-approved` | "Curator" | event.type == SubmissionApproved && first time as submitter |

### Backfill

Adding a new achievement that should apply to historical users runs `scripts/replay-events.ts --projector achievements --pk USER#<sub>` (spec 011). The projector is idempotent + counter updates are EMA-free deltas, so replay produces the canonical state.

### Invariants preserved

- All writes under `PK = USER#<sub>` use the projector's `event.sub` — never an external argument.
- Idempotent grants via `attribute_not_exists`.
- No secondary RPCs on the synchronous attempt-post path; everything happens through the event Lambda.

## Alternatives considered

1. **Synchronous grants in `attempts-post`.** Couples achievements to the hot path; every new achievement grows the handler. Rejected (spec 011 exists exactly to avoid this).
2. **Code-as-config achievements (TS classes per achievement).** More flexible, but harder to backfill safely (impure constructors). Pure data + pure predicates is strictly better.
3. **Periodic batch job that recomputes achievements.** Adds latency, more cost, more code than the projector approach.

## Risks & mitigations

- **Counter drift** if a projector run fails repeatedly. Mitigation: a once-a-week `verify-counters` job recomputes counters from raw attempts (~one Query per user) and patches mismatches. Cheap at one user; revisit at scale.
- **Hidden achievement spoilers via API enumeration.** `/achievements/all` only returns *non-hidden* defs; hidden ones appear once earned.
- **Locale & copy.** Titles/descriptions are passed through the i18n catalog (spec 016) — not hardcoded English in the UI.

## Implementation appendix

### New module layout

```
shared/src/achievements/
  types.ts
  defs.ts             # exports ALL_ACHIEVEMENTS = [ ... ]
  predicates.ts       # reusable building blocks (e.g. firstTime, threshold)

api/src/events/projectors/achievements.ts
api/src/core/use-cases/list-achievements.ts
api/src/handlers/achievements-list.ts
```

### New endpoints

| Method | Path | Notes |
|---|---|---|
| `GET` | `/achievements/all` | static catalog (hidden ones omitted) |
| `GET` | `/achievements/me` | earned + locked + progress hints |

### Web changes

- New page `web/src/app/achievements/page.tsx` (auth-required for `/me`; falls back to "all" for guests).
- Toast on first earn — driven by a tiny client-side check after the result card returns; the toast pulls from `/achievements/me` (eventually consistent with the projector — usually <2 s).
- Profile sidebar: top 3 most-recent achievements.

### Test plan

- **Unit:** every predicate has a golden `(event, stats) → bool` table.
- **Projector:** seeded fake events + in-memory adapter → expected ACHIEVEMENT items.
- **Idempotency:** call projector with the same event 3× → exactly one ACHIEVEMENT item.
- **Concurrency:** simulated double-trigger of `60-wpm-club` (two events arriving back-to-back) → one grant only.
- **Backfill parity:** synthesise 50 attempts for a fake user; live granting vs replay-based granting → identical earned set.
- **Visual regression:** achievements page snapshot with 3 earned + 5 locked + 1 in-progress.
