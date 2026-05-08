---
status: Draft
author: -
created: 2026-05-07
updated: 2026-05-07
---

# 009 — Performance & cost hardening

## Summary

Three concrete fixes that each pay for themselves: (1) eliminate the full-table `Scan` in `daily-get.ts` by adding an entity-keyed GSI (or a list partition); (2) shrink Lambda cold-start by trimming the AWS SDK bundle; (3) tighten CloudFront cache headers and HTML revalidation so the static-export site actually benefits from edge caching.

## Motivation

- **`daily-get.ts:48-72` does a `Scan` filtered by `entity = "SNIPPET"`.** That cost grows linearly with snippet count and burns RCUs even on cache-hit days (the Scan only runs on first daily seed of the date, but every cold Lambda re-evaluates the cache miss path on a fresh date). On-demand DDB charges per RCU consumed; Scan + Filter consumes RCUs on *every scanned item*, not on returned items.
- **Cold start.** `api/` Lambda bundles include the full `@aws-sdk/client-dynamodb` + `lib-dynamodb`. Bun build with no externals ships ~6 MB; cold start ~600 ms for `daily-get` based on README's existing build setup.
- **CF caching.** A static export doesn't auto-set immutable cache headers on hashed assets vs HTML. Today both cache identically; that means HTML changes lag invalidation, and `_next/static` assets miss the long-TTL bucket they could trivially own.

## Goals

- `daily-get` first-of-day path: O(1) RCU regardless of snippet count.
- Steady-state cold start ≤ 250 ms p99 for the 5 handlers.
- CloudFront cache hit ratio for `_next/static/**` ≥ 99 %; HTML always revalidated.

## Non-goals

- Not migrating to Lambda SnapStart (Java-only).
- Not switching to provisioned concurrency. Free-tier-friendliness is the constraint.

## Design

### Fix 1 — Snippet listing without Scan

Add a list partition: every `SNIPPET` row already has `PK = "SNIPPET"` and `SK = "SNIPPET#<id>"`. A `Query(PK = "SNIPPET")` is already O(snippets) RCU but **without** the filter overhead — Scan + filter pays for non-matching items, Query does not. Replace `ScanCommand` with `QueryCommand` directly. No schema change.

For larger pools (hundreds), add a sparse `GSI2`:

| GSI2PK | GSI2SK | Use |
|---|---|---|
| `LANG#<lang>` | `SNIPPET#<id>` | per-language listing |

`daily-get` then queries `GSI2PK = LANG#<chosen-lang>` and picks `hashDate(date) % count`. Bonus: makes per-language daily a free upgrade.

**Migration.** GSI2 is sparse: only `SNIPPET` rows get `GSI2PK / GSI2SK`. Backfill by re-running `seed.ts` (idempotent) and a one-shot script `infra/scripts/backfill-gsi2.ts` for any rows added between deploys.

### Fix 2 — Cold-start budget

- Replace `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` with **`aws-sdk-client-mock`** for tests only and import only the *commands* used per handler from `@aws-sdk/lib-dynamodb`.
- Externalise `aws-sdk` from the Bun bundle and rely on the Node 22 Lambda runtime providing v3 — *if* available. Verify in deploy: `node -e 'require.resolve("@aws-sdk/client-dynamodb")'` inside the runtime image. If absent, keep bundled but with `bun build --minify --target=node` (already on; verify `--define process.env.NODE_ENV=production`).
- Move repo construction to module top-level (one client per Lambda container, not per request — already done in `lib/dynamo.ts`; preserve in spec 003 migration).

### Fix 3 — CloudFront cache headers

In `infra/scripts/deploy-web.ts` (or wherever `aws s3 sync` is invoked):

| Path glob | Cache-Control |
|---|---|
| `_next/static/**` | `public, max-age=31536000, immutable` |
| `**/*.html`, `index.html` | `public, max-age=0, must-revalidate` |
| `*.{ico,svg,png,webp}` (root) | `public, max-age=86400` |

CloudFront distribution: ensure `compress: true`, default TTL 0 (let `Cache-Control` win).

### Invariants preserved

- Same key schema for primary access patterns.
- Daily-challenge determinism: `hashDate(date) % count` semantics unchanged; Fix 1 may slightly change `count` (per-language vs global), so v2 of daily uses a *new* SK prefix `DATE#<lang>#<date>` to avoid colliding with already-seeded days. Old `DATE#<yyyy-mm-dd>` rows continue to serve as-is.

## Alternatives considered

1. **Cache snippet list in Lambda memory** for the container lifetime. Doesn't help across cold containers; doesn't fix the fundamental Scan cost. Useful as a *complement* to Fix 1, not a replacement.
2. **Pre-bake `daily` for the next 30 days at deploy time** (already done by seed). It is — but `daily-get` still has a self-seed fallback for dates beyond the seed window. Fix 1 makes that fallback cheap.

## Risks & mitigations

- **GSI2 cost.** A sparse GSI on ~100 snippet rows is ~$0/mo on-demand. Negligible.
- **Removing AWS SDK from bundle** could break if Lambda runtime changes. Mitigation: feature flag (`BUNDLE_AWS_SDK=true|false`), default to bundled until verified in prod for two deploys.

## Implementation appendix

### Concrete code changes

- `api/src/handlers/daily-get.ts:48` — replace `ScanCommand` with `QueryCommand` (PK=`SNIPPET`).
- `api/src/repos/snippets.ts` (post-spec 003) — `listAll()` uses Query; `listByLanguage(lang)` uses GSI2 once added.
- `infra/template.yaml` — add GSI2 definition; add `LoggingConfig` (spec 008) and `Tracing: Active`.
- `infra/scripts/deploy-web.ts` — split `aws s3 sync` into two passes (assets, HTML) with different `--cache-control`.
- `infra/scripts/backfill-gsi2.ts` — one-shot UpdateItem on every `entity=SNIPPET` row to set `GSI2PK / GSI2SK`.

### Verification

- Before/after CloudWatch:
  - `daily-get` p99 latency.
  - DDB `ConsumedReadCapacityUnits` summed per day.
- CloudFront cache hit ratio (CloudWatch metric `CacheHitRate`) before/after asset deploy.
- Lambda init duration metric per function (cold-start budget assertion in CI: deploy + synthetic invoke + assert `initDuration < 300 ms`).

### Test plan

- Unit: `keyBuilders.gsi2Snippet(id)` and inverse.
- Integration (DDB Local): seed 50 snippets, query GSI2 by language, assert count and ordering.
- Backfill script idempotency: run twice, second run is a no-op.
