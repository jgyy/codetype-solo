---
status: Draft
author: -
created: 2026-05-07
updated: 2026-05-07
---

# 002 — Request validation layer

## Summary

Replace the hand-rolled `validate(b: Body)` function in `api/src/handlers/attempts-post.ts` (and the implicit "trust the cast" pattern in other handlers) with a single schema-driven validation layer using **Zod**. Schemas live in `@codetype/shared` so the web client can reuse them.

## Motivation

`attempts-post.ts:81` parses JSON with `JSON.parse(... ) as Body` — a *cast*, not a validation. The follow-up `validate()` re-checks fields manually, which:

- duplicates the type definition and the runtime check (drift risk),
- has no coverage for type confusion (a string `"123"` for `duration_ms` would pass `<= 0` checks),
- doesn't validate `daily-get` (`?date=`) or `attempts-list` (`?from=&to=`) query strings beyond a regex,
- is invisible to the frontend, so the UI can't predict what the server will reject.

## Goals

- One source of truth per endpoint: a Zod schema.
- Schema reused on the web client to validate before submitting (cheap UX win).
- Validation failures map cleanly to `bad_request` envelopes (spec 001) with field-level `details`.
- Snippet seed data validated at seed-time, not first request.

## Non-goals

- Not adopting Zod for internal value types (e.g. WPM math). Pure-TS types remain pure-TS types.
- Not auto-generating OpenAPI from Zod (that's spec 010, separate roll-out).

## Design

**Schema location:** `shared/src/schemas/`. One file per resource (`attempts.ts`, `daily.ts`, `snippets.ts`, `profile.ts`). Each file exports both the Zod schema and the inferred TS type:

```ts
export const PostAttemptBody = z.object({
  client_attempt_id: z.string().min(1).max(64),
  snippet_id: z.string().min(1),
  language: z.enum(["js","py","c","go"]),
  duration_ms: z.number().int().positive().max(30 * 60_000),
  chars_total: z.number().int().positive(),
  chars_correct: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(1),
  wpm_gross: z.number().nonnegative(),
  wpm_net: z.number().nonnegative(),
  wpm_scaled: z.number().nonnegative(),
}).refine(b => b.chars_correct <= b.chars_total, { path: ["chars_correct"], message: "chars_correct > chars_total" });
export type PostAttemptBody = z.infer<typeof PostAttemptBody>;
```

**Middleware integration** (composes with spec 004):

```ts
const validate = <S extends z.ZodTypeAny>(schema: S) =>
  (raw: unknown): Result<z.infer<S>, ApiError> => {
    const r = schema.safeParse(raw);
    return r.success
      ? ok(r.data)
      : err({ code: "bad_request", message: "validation_failed", details: r.error.issues });
  };
```

**Web client reuse.** `web/src/lib/api.ts` imports `PostAttemptBody` and runs `safeParse` before `fetch`, surfacing field errors in the UI without a round-trip.

**Invariants preserved.** Server still recomputes WPM after validation — the schema accepts the client's WPM numbers, but the handler ignores them for storage (only uses them to decide `wpm_mismatch`).

## Alternatives considered

1. **Valibot.** Smaller bundle, but Zod's TS inference is more mature and the team already knows it. Reconsider if web bundle size becomes a problem.
2. **Hand-rolled per-field validators with a shared helper.** Cheaper deps, more code; loses inference. Rejected.
3. **JSON Schema + Ajv.** Bigger runtime, less ergonomic in TS. Rejected.

## Risks & mitigations

- **Bundle size on web.** Zod is ~12 KB gzip; acceptable for our use. Mitigation: tree-shake by importing schemas individually from `@codetype/shared/schemas/*`.
- **Performance.** `safeParse` adds <1 ms per request for our shapes; negligible vs DDB latency.

## Implementation appendix

### File changes

- `shared/package.json` — add `zod` as `dependency`.
- `shared/src/schemas/attempts.ts`, `daily.ts`, `snippets.ts`, `profile.ts`.
- `shared/src/index.ts` — re-export schemas.
- `api/src/handlers/*` — replace inline body cast + `validate()` with `validate(PostAttemptBody)(JSON.parse(event.body))`.
- `web/src/lib/api.ts` — pre-flight validation; on failure, return `Result<never, FieldErrors>`.
- `infra/scripts/seed.ts` — validate each snippet against `SnippetSchema` before `PutItem`; fail fast on invalid seed data.

### Error detail format

`details` for a validation failure is `z.ZodIssue[]`. Frontend reads `issue.path` (`["chars_correct"]`) and `issue.message`. We do **not** translate messages server-side — keep raw Zod output for now; can be wrapped later if i18n becomes a goal.

### Test plan

- Unit: per schema, golden-table tests of valid + each invalid case.
- Property test (bun's built-in or fast-check): `wpm_gross >= 0 ∧ duration_ms > 0` round-trips.
- Web e2e (Playwright optional): submit form with `chars_correct > chars_total`; assert inline error appears without network call.
