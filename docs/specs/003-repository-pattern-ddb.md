---
status: Draft
author: -
created: 2026-05-07
updated: 2026-05-07
---

# 003 — Repository pattern over DynamoDB

## Summary

Introduce thin repository modules (`AttemptsRepo`, `SnippetsRepo`, `DailyRepo`, `ProfileRepo`) that encapsulate every `PutCommand` / `GetCommand` / `QueryCommand` / `ScanCommand` currently inlined in handlers. Repos expose **domain-shaped** methods returning `Result<T, ApiError>` (spec 001) — never raw DDB errors.

## Motivation

Handlers currently mix three concerns: HTTP, validation, and persistence. Examples:

- `attempts-post.ts:62-90` constructs DDB items inline, knowing the key schema (`PK`, `SK`, `GSI1PK`, `GSI1SK`). Any future entity has to repeat this knowledge.
- `daily-get.ts:48-72` does a `Scan` with filter expression — the scan logic and the seeding logic are tangled in the handler.
- Handler tests need DDB Local or a heavy mock; there's no seam to swap an in-memory implementation.

## Goals

- One file per entity owns its key schema and access patterns.
- Handlers depend only on repo *interfaces*, not the SDK or table layout.
- Tests can run against an in-memory repo without DDB Local.
- Idempotency and condition expressions are an implementation detail of the repo, not visible to handlers.

## Non-goals

- Not introducing a generic ORM. Single-table DDB is intentional; abstracting over it costs more than it saves.
- Not unifying Scan and Query under one method — they have different cost profiles and should *look* different at the call site.

## Design

**Module layout:**

```
api/src/repos/
  ddb-client.ts       # the shared DynamoDBDocumentClient (was lib/dynamo.ts)
  attempts.ts         # interface + DDB impl + in-memory impl
  snippets.ts
  daily.ts
  profile.ts
  index.ts            # composeRepos(client) -> Repos
```

**Interface example** (`attempts.ts`):

```ts
export interface AttemptsRepo {
  put(input: NewAttempt): Promise<Result<{ duplicate: boolean }, ApiError>>;
  listByUser(sub: string, range: DateRange): Promise<Result<Attempt[], ApiError>>;
}
```

`NewAttempt` is the *domain* shape — no `PK` / `SK`. The DDB impl translates:

```ts
const item = {
  PK: `USER#${input.sub}`,
  SK: `ATTEMPT#${input.createdAt}#${input.clientAttemptId.slice(0,6)}`,
  GSI1PK: `USER#${input.sub}`,
  GSI1SK: `DATE#${input.createdAt.slice(0,10)}#${input.createdAt}`,
  entity: "ATTEMPT",
  ...
};
```

**Idempotency** lives in the repo: on `ConditionalCheckFailedException`, return `ok({ duplicate: true })`. Handlers see a clean boolean.

**Composition.** Handlers receive repos via context (spec 004 middleware), not module imports. Tests pass an in-memory implementation.

**Invariants preserved.** PK still equals `USER#<sub>`; the repo enforces it by construction (the `sub` parameter is required, no overload accepts a raw PK). This makes "leaking another user's data" structurally impossible at the handler call site.

## Alternatives considered

1. **Single `Datastore` god-object with all access patterns.** Easier to wire, but blows up over time and conflates entities. Rejected.
2. **DAO classes with constructor-injected client.** Equivalent capability; functions+closures match the existing style (no classes anywhere in handlers). Going with functions.

## Risks & mitigations

- **Boilerplate.** Yes — ~40 lines per repo. Mitigation: a single `keyBuilders.ts` with `userPk(sub)`, `attemptSk(createdAt, id)` etc. shared across repos.
- **Test parity.** In-memory impl could drift from DDB semantics (sort order, `BETWEEN` inclusivity). Mitigation: a shared **conformance test suite** that both impls must pass (the in-memory test runs in-process; the DDB test runs against DDB Local in CI only — see spec 008).

## Implementation appendix

### Key schema reference (current, preserved)

| Entity | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| ATTEMPT | `USER#<sub>` | `ATTEMPT#<iso>#<id6>` | `USER#<sub>` | `DATE#<yyyy-mm-dd>#<iso>` |
| PROFILE | `USER#<sub>` | `PROFILE` | – | – |
| SNIPPET | `SNIPPET` | `SNIPPET#<id>` | – | – |
| DAILY | `DAILY` | `DATE#<yyyy-mm-dd>` | – | – |

### Repo signatures

```ts
interface AttemptsRepo {
  put(a: NewAttempt): Promise<Result<{ duplicate: boolean }, ApiError>>;
  listByUser(sub: string, range: { from: string; to: string }): Promise<Result<Attempt[], ApiError>>;
}
interface SnippetsRepo {
  get(id: string): Promise<Result<Snippet, ApiError>>;
  listByEntity(): Promise<Result<Snippet[], ApiError>>; // see spec 009 — switch to GSI2
}
interface DailyRepo {
  getOrSeed(date: string, deterministic: (snippets: Snippet[]) => Snippet): Promise<Result<DailySeed, ApiError>>;
}
interface ProfileRepo {
  upsert(sub: string, patch: ProfilePatch): Promise<Result<Profile, ApiError>>;
}
```

### Migration steps

1. Add `api/src/repos/` with DDB impls; handlers untouched.
2. Migrate one handler at a time. Start with `attempts-post.ts` (highest churn).
3. Once all handlers use repos, move `api/src/lib/dynamo.ts` → `api/src/repos/ddb-client.ts` and delete the old path.
4. Add in-memory impls and conformance tests (gated by env).

### Test plan

- **Conformance suite** (`api/test/repos/contract.test.ts`): a function `runRepoContract(makeRepo)` containing ~12 assertions per repo. Imported twice — once with the in-memory factory (always), once with the DDB factory (CI-only via `RUN_DDB_TESTS=1`).
- **Handler tests** can now drop DDB mocks and use in-memory repos directly.
