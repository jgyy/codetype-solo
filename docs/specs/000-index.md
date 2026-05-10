# CodeType Solo — Specs Index

This directory contains design specifications for new features and architectural improvements. Each spec is a self-contained document scoped to one concern, reviewable as a standalone PR.

## Conventions

- **Filename:** `NNN-kebab-title.md`, where `NNN` is a zero-padded sequence number assigned at draft time.
- **Status lifecycle:** `Draft → Accepted → Implemented → Superseded`. Changes after `Accepted` go in a new spec that supersedes the old one — never silently rewrite history.
- **Structure (mandatory sections):**
  1. **Front-matter block** (Status / Author / Created / Updated / Supersedes / Superseded-by).
  2. **Summary** — 2–4 sentence elevator pitch.
  3. **Motivation** — what's broken or missing today, with concrete file/line references.
  4. **Goals / Non-goals** — bulleted, falsifiable.
  5. **Design** — narrative; covers data model, request/response shapes, invariants preserved.
  6. **Alternatives considered** — at least one.
  7. **Risks & mitigations.**
  8. **Implementation appendix** — concrete file paths, function signatures, DDB key schemas, migration steps, test plan.

- **Invariants every spec must preserve** (inherited from `README.md` and current code):
  - Auth boundary is the partition key: `PK = USER#<sub>` for all per-user reads/writes.
  - Idempotent writes via `ConditionExpression: attribute_not_exists(...)`.
  - Server recomputes WPM (`shared/src/wpm.ts`); client numbers are advisory and only set `wpm_mismatch`.
  - Single-table DynamoDB; new entity types use distinct `entity` values and follow the existing `PK / SK / GSI1PK / GSI1SK` shape.

## Specs

Implemented / archived specs live in [`done/`](done/). Active drafts:

| # | Title | Scope | Status |
|---|-------|-------|--------|
| 012 | [Hexagonal architecture (ports & adapters)](done/012-hexagonal-ports-and-adapters.md) | Refactor | Implemented |
| 013 | [Adaptive practice & spaced repetition](013-adaptive-practice-and-spaced-repetition.md) | Feature | Draft |
| 014 | [Real-time multiplayer races](014-realtime-multiplayer-races.md) | Feature | Draft |
| 015 | [Achievements & progression](015-achievements-and-progression.md) | Feature | Draft |
| 016 | [Accessibility, theming & i18n](016-accessibility-theming-i18n.md) | Quality | Draft |

## Recommended sequencing

`012` is a foundational refactor that makes the feature specs cheap. Suggested order:

1. **012 (hexagonal)** — establishes the use-case + ports seam; everything else slots into it.
2. **016 (a11y/theme/i18n)** — pure web; ships independently of backend work.
3. **015 (achievements)** — first real consumer of the event pipeline shipped in `done/011`; fills in the achievements projector stub.
4. **013 (adaptive practice)** — server-side selection logic; reuses the use-case shape from 012.
5. **014 (multiplayer)** — heaviest; depends on 012 for the WS handlers to stay thin.

## Spec template

```md
---
status: Draft
author: <name>
created: YYYY-MM-DD
updated: YYYY-MM-DD
supersedes: -
superseded-by: -
---

# NNN — <Title>

## Summary
## Motivation
## Goals
## Non-goals
## Design
## Alternatives considered
## Risks & mitigations
## Implementation appendix
```
