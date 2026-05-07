---
status: Draft
author: -
created: 2026-05-07
updated: 2026-05-07
---

# 010 — OpenAPI contract & generated client

## Summary

Author one `openapi.yaml` (or generate it from the Zod schemas in spec 002) as the single contract between API and web. Generate a typed TS client into `web/src/lib/api-client/` at build time. Eliminates the duplicated `fetch` + JSON shape definitions in `web/src/lib/api.ts`.

## Motivation

Right now `web/src/lib/api.ts` reaches into the API by manually constructing URLs and asserting response shapes. With specs 001 (envelope) and 002 (Zod schemas) landed, the missing piece is a *contract* both sides verify against. Without it, a backend rename can silently ship and only break in the browser.

## Goals

- One source-of-truth document or generator for endpoint shapes.
- Typed client in web with no hand-maintained URL strings.
- Contract test in CI that diffs the live API spec against the committed contract.

## Non-goals

- Not adopting tRPC. Keeps us free to add non-TS clients (mobile, CLI) later.
- Not auto-generating API handlers from spec. Schemas (Zod) drive handlers; OpenAPI is generated *from* them, not the other way around.

## Design

**Generator chain:**

```
shared/src/schemas/*.ts (Zod) ──[zod-to-openapi]──► docs/api/openapi.yaml
                                                          │
                                                          ├─[openapi-typescript]─► web/src/lib/api-client/types.gen.ts
                                                          └─[openapi-fetch]──────► web/src/lib/api-client/client.ts
```

`zod-to-openapi` runs in `bun --filter @codetype/shared build:openapi`. The output `openapi.yaml` is committed; CI fails if regeneration produces a diff (catches "forgot to update schema" PRs).

**Web client usage:**

```ts
import { client } from "@/lib/api-client/client";
const res = await client.POST("/attempts", { body: { ... } });
if (!res.data?.ok) showError(res.data?.error ?? res.error);
```

**Server-side enforcement.** `withSchema` already validates inputs against Zod (spec 002). For outputs, add an optional `withResponseSchema` middleware — only enabled in non-prod — that validates the success branch against the same Zod schema before returning. Catches accidental shape regressions during dev.

## Alternatives considered

1. **Hand-maintained `openapi.yaml`.** Predictable drift between spec and reality. Rejected.
2. **tRPC.** Excellent DX for TS-only stacks, but locks the wire format. Rejected.
3. **GraphQL.** Overkill for 6–10 endpoints. Rejected.

## Risks & mitigations

- **`zod-to-openapi` quirks** with `refine` / `transform`. Mitigation: prefer `superRefine` with `meta()` to keep OpenAPI legible; document in `shared/src/schemas/README.md`.
- **Two clients for two envelope versions during spec 001 rollout.** Mitigation: this spec is sequenced *after* 001 has fully cut over.

## Implementation appendix

### Sequencing

This spec depends on 001 (stable envelope) and 002 (Zod schemas). Implement after both ship.

### File additions

- `shared/scripts/build-openapi.ts`
- `docs/api/openapi.yaml` (generated, committed)
- `web/src/lib/api-client/{types.gen.ts, client.ts}` (generated, committed — humans never edit)
- `.github/workflows/ci.yml` step: `bun run build:openapi && git diff --exit-code docs/api/openapi.yaml web/src/lib/api-client/`

### Test plan

- Generator unit: snapshot the generated YAML for a tiny fixture schema; fail loudly on transitive `zod-to-openapi` upgrades.
- Contract test: deploy preview → fetch `/openapi.json` → diff against committed.
- Web compile check: typed client must surface a type error if a handler removes a field.
