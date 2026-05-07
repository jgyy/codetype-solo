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
  - Auth boundary is the partition key: `PK = USER#<sub>` for all per-user reads/writes (`api/src/handlers/attempts-post.ts:55`).
  - Idempotent writes via `ConditionExpression: attribute_not_exists(...)`.
  - Server recomputes WPM (`shared/src/wpm.ts`); client numbers are advisory and only set `wpm_mismatch`.
  - Single-table DynamoDB; new entity types use distinct `entity` values and follow the existing `PK / SK / GSI1PK / GSI1SK` shape.

## Specs

| # | Title | Scope | Status |
|---|-------|-------|--------|
| 001 | [Error envelope & Result type](001-error-envelope-and-result-type.md) | Refactor | Draft |
| 002 | [Request validation layer (Zod)](002-request-validation-layer.md) | Refactor | Draft |
| 003 | [Repository pattern over DynamoDB](003-repository-pattern-ddb.md) | Refactor | Draft |
| 004 | [Handler composition middleware](004-handler-composition-middleware.md) | Refactor | Draft |
| 005 | [Opt-in public leaderboards](005-feature-leaderboards.md) | Feature | Draft |
| 006 | [User snippet submission + moderation](006-feature-snippet-submission.md) | Feature | Draft |
| 007 | [Keystroke replay & anti-cheat](007-feature-replay-and-anticheat.md) | Feature | Draft |
| 008 | [Testing & observability baseline](008-testing-and-observability.md) | Quality | Draft |
| 009 | [Performance & cost hardening](009-performance-and-cost.md) | Quality | Draft |
| 010 | [OpenAPI contract & generated client](010-openapi-contract.md) | Refactor | Draft |

## Spec template

Copy `_template.md` (below) when starting a new spec.

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
