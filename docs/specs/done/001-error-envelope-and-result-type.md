---
status: Draft
author: -
created: 2026-05-07
updated: 2026-05-07
supersedes: -
superseded-by: -
---

# 001 — Error envelope & Result type

## Summary

Standardise every API response (success and failure) on a single JSON envelope and replace ad-hoc `throw` / `return badRequest(...)` patterns inside Lambda handlers with a `Result<T, ApiError>` discriminated union from `@codetype/shared`. The HTTP layer becomes the only place that translates a `Result` into a status code.

## Motivation

Today error shapes diverge subtly across handlers:

- `api/src/lib/auth.ts:badRequest` returns `{ error: "bad_request", message }`.
- `api/src/lib/auth.ts:unauthorized` returns `{ error: "unauthorized" }` (no `message`).
- `api/src/handlers/daily-get.ts` returns `{ error: "seed_failed" }` (different field set).
- `api/src/handlers/attempts-post.ts` may throw raw AWS SDK errors on non-`ConditionalCheckFailed` paths, surfacing 500s with no envelope.

The frontend (`web/src/lib/api.ts`) therefore has to special-case error parsing, and adding a new handler invites yet another shape.

## Goals

- One envelope shape for every response, success or failure.
- Domain errors (e.g. "snippet not found", "duration too short") are values, not exceptions.
- Unknown errors (programming bugs, AWS 5xx) are caught at the edge and mapped to a single `internal` envelope without leaking stack traces.
- Zero behaviour change for happy-path consumers — existing fields stay where they are, just nested under `data`.

## Non-goals

- Not introducing a generic Result library dependency (`neverthrow`, `fp-ts`). Keep it ~30 lines of TS in `shared/`.
- Not changing HTTP status codes for already-correct paths.

## Design

**Envelope:**

```ts
type Envelope<T> =
  | { ok: true;  data: T }
  | { ok: false; error: { code: ErrorCode; message: string; details?: unknown } };
```

`ErrorCode` is a finite string union: `"unauthorized" | "bad_request" | "not_found" | "conflict" | "rate_limited" | "internal"`. New codes require a spec amendment — keeps the surface auditable.

**Status code mapping** (one place: `api/src/lib/http.ts`):

| code | status |
|---|---|
| `unauthorized` | 401 |
| `bad_request`  | 400 |
| `not_found`    | 404 |
| `conflict`     | 409 |
| `rate_limited` | 429 |
| `internal`     | 500 |

**Result type** (`shared/src/result.ts`):

```ts
export type Ok<T>  = { ok: true;  value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E> = Ok<T> | Err<E>;
export const ok  = <T>(value: T): Ok<T>  => ({ ok: true,  value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
```

Handlers return `Promise<Result<TData, ApiError>>`; an `httpAdapter(handler)` wrapper turns it into APIGW response shape. This keeps domain code free of `statusCode` / `headers` noise.

**Invariants preserved.** Idempotent-write handling stays inside the repository (spec 003); on `ConditionalCheckFailedException` the repository returns `ok({ duplicate: true })`, not an error.

## Alternatives considered

1. **Throw structured `ApiError` and catch at edge.** Simpler at call sites, but loses exhaustiveness checking — TS won't tell you a code path forgot to handle "not found". Rejected.
2. **Adopt `neverthrow`.** Adds a dep for what we can do in 30 lines; their ergonomics (`.map`, `.andThen`) are nice but not load-bearing for our handler size. Rejected.

## Risks & mitigations

- **Frontend breakage.** The envelope change is a wire-format break. Mitigation: ship API + web together in one deploy; bump `NEXT_PUBLIC_API_VERSION` and have the API include `X-Api-Version: 2` header. Keep one release window where v1 and v2 coexist by branching in `httpAdapter` based on `Accept-Version` request header.
- **Stack trace leakage.** Mitigation: `httpAdapter` always serialises `internal` as `{ code: "internal", message: "internal_error", details: undefined }`; the real error goes to structured logs (spec 008).

## Implementation appendix

### New / changed files

- `shared/src/result.ts` — `Result<T,E>`, `ok`, `err`, `isOk`, `isErr`.
- `shared/src/api-error.ts` — `ApiError` type, `ErrorCode` union.
- `shared/src/index.ts` — re-export.
- `api/src/lib/http.ts` — `httpAdapter`, status-code map, JSON serialiser, request-id header propagation.
- `api/src/lib/auth.ts` — delete `badRequest` / `unauthorized` / `json` helpers (now lives in `http.ts`).
- All five handlers in `api/src/handlers/` — switch from raw event → response to `(ctx) => Promise<Result<T, ApiError>>`.
- `web/src/lib/api.ts` — single `unwrap()` helper that throws on `ok: false`, returns `data` on `ok: true`.

### Adapter signature

```ts
type Handler<T> = (ctx: HandlerCtx) => Promise<Result<T, ApiError>>;
type HandlerCtx = { event: APIGatewayProxyEventV2WithJWTAuthorizer; caller: Caller | null; requestId: string };
export function httpAdapter<T>(h: Handler<T>): APIGatewayHandler;
```

### Migration steps

1. Land `shared/` additions with unit tests (Result helpers, mapping table).
2. Add `httpAdapter` alongside existing helpers; do not delete old helpers yet.
3. Migrate handlers one at a time behind a feature flag in `httpAdapter` that double-emits old-shape and new-shape on `Accept-Version: 1`.
4. Update `web/` to send `Accept-Version: 2` and use `unwrap()`.
5. Delete v1 branch, delete `api/src/lib/auth.ts` helpers.

### Test plan

- Unit: `result.test.ts` (constructors, exhaustiveness via `satisfies never`), `http.test.ts` (status mapping table, internal error never leaks `details`).
- Handler tests: each handler asserts envelope shape on success and on each known failure mode.
- Contract test: golden-file snapshot of envelope JSON for one happy-path response per handler — fails loudly on accidental rename.
