---
status: Draft
author: -
created: 2026-05-08
updated: 2026-05-08
supersedes: -
superseded-by: -
---

# 012 — Hexagonal architecture (ports & adapters) for the API

## Summary

Refactor `api/src/` into a **hexagonal** layout: a pure `core/` (domain use-cases, no SDK imports) surrounded by adapters (`adapters/http/`, `adapters/ddb/`, `adapters/cognito/`, `adapters/clock/`). The repository pattern (spec 003) and middleware (spec 004) are *parts* of this; this spec is the umbrella that ties them together and adds the missing bits (input/output ports, a single composition root, a fake-clock for time-dependent tests).

## Motivation

Specs 003 and 004 each move one concern out of handlers, but they don't agree on a *shape*. As-is we'd end up with repos in `api/src/repos/`, middleware in `api/src/middleware/`, and the actual business logic still inlined in `api/src/handlers/*.ts`. The use-case logic — *what* it means to record an attempt, approve a submission, compute a daily challenge — is the most valuable, most-tested, least-likely-to-change code, and it should be the *centre* of the architecture, not a leftover at the edge.

Symptoms today:

- `attempts-post.ts:30-118` mixes HTTP parsing, validation, recompute, persistence, streak update. Re-using "record an attempt" from a future CLI tool, a webhook replay (spec 011), or a batch importer means copy-paste.
- Time is `Date.now()` scattered across handlers and `streak.ts`. Streak tests use real time and pass `now` manually in some places, not in others.
- Cognito JWT verification is partly in middleware, partly in `api/src/lib/auth.ts`. Two adapters pretending to be one.

## Goals

- A pure **core** that can run in Node, Bun, the browser, and a test runner without any AWS dependency.
- Every external dependency reaches the core through a **port** (a TS interface) and is satisfied by an **adapter**.
- A single **composition root** (`api/src/composition.ts`) wires real adapters in production and fakes in tests.
- Time, randomness, and identity are explicit ports — no hidden globals.

## Non-goals

- Not class-based DI containers. Plain functions + closures, matching existing style.
- Not separate packages per layer. Same `api/` workspace; folder boundaries are enforced by lint rules, not by `package.json`.
- Not rewriting `shared/` — `shared/` is already pure and stays as-is. It is *consumed* by the core.

## Design

### Folder layout

```
api/src/
  core/                          # pure; no imports from aws-sdk, no I/O
    use-cases/
      record-attempt.ts
      approve-submission.ts
      get-daily-challenge.ts
      list-attempts.ts
      get-leaderboard.ts          # spec 005
    ports/
      attempts-port.ts            # = AttemptsRepo interface (re-exported)
      snippets-port.ts
      profile-port.ts
      submissions-port.ts
      clock-port.ts               # { now(): Date }
      id-port.ts                  # { newId(): string }
      auth-port.ts                # { verify(token): Promise<Result<Identity, ApiError>> }
  adapters/
    ddb/                          # repos from spec 003 live here
    http/                         # API Gateway event → use-case, response → APIGatewayProxyResultV2
    cognito/                      # JWT verifier
    clock/system.ts, clock/fake.ts
    id/uuid.ts, id/seq.ts
  handlers/                       # ultra-thin: parse event → call use-case → format response
  composition.ts                  # one place that imports adapters
```

### Use-case shape (the core)

```ts
// api/src/core/use-cases/record-attempt.ts
export type RecordAttemptDeps = {
  attempts: AttemptsPort;
  profile: ProfilePort;
  clock: ClockPort;
  id: IdPort;
};
export type RecordAttemptInput = { sub: string; body: PostAttemptBody };
export type RecordAttemptOutput = { attempt: Attempt; streak: Streak; cheat: CheatReport };

export const recordAttempt = (d: RecordAttemptDeps) =>
  async (input: RecordAttemptInput): Promise<Result<RecordAttemptOutput, ApiError>> => {
    const wpm = computeWpm(input.body);                       // shared, pure
    const cheat = analyse(input.body.timeline, wpm);          // shared, pure (spec 007)
    const id = d.id.newId();
    const createdAt = d.clock.now().toISOString();
    const put = await d.attempts.put({ sub: input.sub, id, createdAt, ...wpm });
    if (!put.ok) return put;
    const profile = await d.profile.bumpStreak(input.sub, createdAt);
    if (!profile.ok) return profile;
    return ok({ attempt: { id, createdAt, ...wpm }, streak: profile.value.streak, cheat });
  };
```

No AWS imports. No `Date.now()`. No `crypto.randomUUID()`. Tests pass `clock.fake()` and `id.seq()`.

### Handler shape (the http adapter)

```ts
// api/src/handlers/attempts-post.ts (post-refactor)
import { compose } from "../composition";
const { recordAttempt } = compose();

export const handler = httpHandler(async (event, ctx) => {
  const body = parsePostAttemptBody(event.body);             // spec 002
  if (!body.ok) return body;
  return recordAttempt({ sub: ctx.identity.sub, body: body.value });
});
```

The handler file shrinks to ~15 lines. It is a *protocol adapter*, not where logic lives.

### Composition root

`api/src/composition.ts` is the **only** place that imports `@aws-sdk/*`, `jsonwebtoken`, etc. It returns an object with one bound use-case per domain operation. Tests import a sibling `composition.test.ts` that swaps adapters for fakes.

```ts
export const compose = (overrides: Partial<Adapters> = {}) => {
  const adapters: Adapters = {
    attempts: overrides.attempts ?? ddbAttemptsAdapter(client),
    profile:  overrides.profile  ?? ddbProfileAdapter(client),
    clock:    overrides.clock    ?? systemClock(),
    id:       overrides.id       ?? uuidId(),
    auth:     overrides.auth     ?? cognitoAuth(env),
    // ...
  };
  return {
    recordAttempt: recordAttempt(adapters),
    approveSubmission: approveSubmission(adapters),
    // ...
  };
};
```

### Lint enforcement

A custom ESLint rule (`no-restricted-imports` with path patterns) prevents:

- `core/**` from importing `aws-sdk`, `@aws-sdk/*`, `jsonwebtoken`, anything under `adapters/`.
- `handlers/**` from importing `adapters/ddb/*` directly (must go through `composition.ts`).

Violations fail CI. This is the only enforcement that prevents the architecture from rotting back into the handler-god-function shape.

### Invariants preserved

- PK = `USER#<sub>` is enforced *inside the adapter* (it always concatenates from `input.sub`); the use-case can't address another user's data because it can't construct keys.
- Idempotency lives in the DDB adapter (spec 003).
- Server WPM recompute is in `shared/` and called by the use-case directly — not skippable from any handler.

## Alternatives considered

1. **Leave it as 003 + 004 only.** Misses the central insight: the *use-case* is the unit of business value, and it's still hidden inside handler files.
2. **NestJS / class-based DI.** Adds a framework, decorators, reflection — over-engineered for a Bun-bundled Lambda.
3. **Functional Core, Imperative Shell with no port interfaces.** Workable, but tests start mocking concrete adapters and we lose the "swap real for fake" symmetry.

## Risks & mitigations

- **Indirection cost.** Yes — one extra hop per call. Mitigation: composition is constant-time at module-load; the runtime cost is one closure call.
- **Refactor blast radius.** All 11 handlers touched. Mitigation: do it one handler at a time, behind a feature branch; keep both shapes coexisting until the last handler migrates. The `composition.ts` is added empty first and grown handler-by-handler.
- **Premature abstraction for ports we have one impl of.** The `clock`, `id`, `auth` ports each have 2 impls (real + fake) — not premature.

## Implementation appendix

### Migration order

1. Add `core/ports/clock-port.ts` + `adapters/clock/{system,fake}.ts`. Migrate `streak.ts` and `daily-get.ts` to take `clock` as a parameter. Remove `Date.now()` from handlers.
2. Add `id-port` + adapters; migrate attempt-id generation.
3. Add `composition.ts` (empty). Migrate handlers one at a time: `attempts-post` → `attempts-list` → `daily-get` → `profile-upsert` → `submissions-*` → `snippet-*` → `leaderboard-get`.
4. Add the ESLint guard rule once all handlers are migrated.
5. Delete `api/src/lib/dynamo.ts` and `api/src/lib/auth.ts` (their bodies live in adapters now).

### Test plan

- **Unit (use-cases):** every use-case tested with in-memory adapters + fake clock + sequential id. No DDB Local needed.
- **Adapter conformance:** the repo conformance suite (spec 003) is now an *adapter conformance suite*; same idea, broader scope (also covers auth, clock).
- **Architecture test:** a tiny `tests/architecture.test.ts` greps `api/src/core/**` and asserts no banned imports — backstop in case ESLint is bypassed.
- **End-to-end:** one Playwright test per primary user flow (submit → approve → daily seeds → attempt → history) — confirms the composition wiring is correct.
