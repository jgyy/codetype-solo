---
status: Draft
author: -
created: 2026-05-07
updated: 2026-05-07
---

# 004 — Handler composition middleware

## Summary

Compose Lambda handlers from a small set of explicit middleware functions — `withRequestId`, `withLogger`, `withAuth`, `withSchema`, `withRepos`, `withErrorEnvelope` — instead of the current "do everything inline" pattern. This is the glue that ties together specs 001 (envelope), 002 (validation), and 003 (repos).

## Motivation

`attempts-post.ts` today reads as: parse JSON → check auth → validate → recompute WPM → build DDB item → put → translate errors. Every new handler repeats the same opening 20 lines (auth check, JSON parse, error translation). Diffs across handlers also drift: `daily-get.ts` has no auth check (intentional: daily is shared) but reuses `badRequest`; `attempts-list.ts` doesn't validate query params at all.

## Goals

- Each handler's body is *only* domain logic. Cross-cutting concerns are imported, not re-implemented.
- Auth requirement is declarative: a handler that needs auth declares it; the middleware enforces it.
- Request ID is generated once and threaded through logs, error envelopes, and downstream calls.
- It's impossible to forget the error envelope — the outermost middleware always produces one.

## Non-goals

- Not introducing a framework (Middy, Hono). Plain function composition is enough.
- Not putting business logic into middleware. Middleware does I/O shaping; domain decisions stay in handlers.

## Design

```ts
// api/src/middleware/types.ts
export type Ctx<TBody = unknown> = {
  event: APIGatewayProxyEventV2WithJWTAuthorizer;
  requestId: string;
  log: Logger;
  caller: Caller | null;
  body: TBody;
  repos: Repos;
};
export type Mw<I, O> = (next: (ctx: I) => Promise<Result<unknown, ApiError>>) =>
                      (ctx: O) => Promise<Result<unknown, ApiError>>;
```

**Composition** uses left-to-right `pipe`:

```ts
export const handler = compose(
  withRequestId(),
  withLogger(),
  withRepos(makeRepos()),
  withAuth({ required: true }),
  withSchema(PostAttemptBody),
  withErrorEnvelope(),
)(async (ctx) => {
  // domain logic only:
  const recomputed = recomputeWpm(ctx.body);
  const r = await ctx.repos.attempts.put({
    sub: ctx.caller!.sub,
    createdAt: new Date().toISOString(),
    ...ctx.body,
    ...recomputed,
  });
  return r.ok ? ok({ ok: true, ...r.value }) : r;
});
```

**Each middleware is ≤30 lines.** Examples:

- `withAuth({ required })`: reads JWT claims; if `required` and no `sub`, short-circuits with `err({ code: "unauthorized" })`.
- `withSchema(schema)`: parses `event.body`, runs `schema.safeParse`, sets `ctx.body`. (For `GET`, parses `event.queryStringParameters`.)
- `withErrorEnvelope`: catches anything thrown, logs with `requestId`, returns `{ statusCode: 500, body: { ok: false, error: { code: "internal", message: "internal_error" } } }`. Translates `Result.err` to status code per spec 001.
- `withRequestId`: prefers `event.headers["x-request-id"]`; falls back to `crypto.randomUUID()`.

**Invariants preserved.** Auth boundary still enforced — but now centrally in `withAuth`, not by repeated `if (!caller) return unauthorized()` lines that one handler could forget.

## Alternatives considered

1. **Decorator functions per concern but no `compose`.** Works for 5 handlers; gets unwieldy at 10+. Pre-emptively choosing `compose` because spec 005 (leaderboards) and 006 (snippets) will add ~6 more handlers.
2. **Hono / Fastify on Lambda.** Real frameworks, but they assume long-lived processes. Cold-start cost on Lambda not worth it for our scale.
3. **Middy.** Mature, but couples us to its lifecycle hooks; we want plain Result-returning functions.

## Risks & mitigations

- **Type-level pain.** Threading a context type that grows (`{} → {requestId} → {requestId, log} → ...`) through `compose` is the classic functional-pipeline TS challenge. Mitigation: use a fixed `Ctx` shape and have middleware **populate** fields rather than extend types. We accept slightly looser typing in exchange for readable signatures.
- **Hidden control flow.** Newcomers may not see *what runs* by reading a handler. Mitigation: `compose(...)` is always called at module top-level, never dynamically; one place to read.

## Implementation appendix

### File layout

```
api/src/middleware/
  compose.ts
  with-request-id.ts
  with-logger.ts
  with-auth.ts
  with-schema.ts
  with-repos.ts
  with-error-envelope.ts
  types.ts
```

### `compose` signature

```ts
export function compose(...mws: Mw[]): (h: Handler) => APIGatewayHandler;
```

### Migration steps

1. Land middleware modules + tests in isolation; no handler change.
2. Migrate `attempts-post.ts` first (smallest blast radius after auth: it's authenticated and idempotent).
3. Then `attempts-list.ts`, `profile-upsert.ts`, `snippet-get.ts`, `daily-get.ts`.
4. Delete the now-unused helpers in `api/src/lib/auth.ts`.

### Test plan

- Unit per middleware (auth required/optional/missing claim; schema valid/invalid; error envelope catches throw).
- Integration: smoke test with all middleware composed against an in-memory repo, asserting envelope on success + each error class.
- Logging assertion: `log.info` calls include `requestId`; failure path logs `error.code` but not stack.
