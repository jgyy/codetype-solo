---
status: Draft
author: -
created: 2026-05-07
updated: 2026-05-07
---

# 008 — Testing & observability baseline

## Summary

Establish a tiered testing strategy (unit → handler → repo conformance → optional E2E) and a structured-logging + metrics + tracing baseline that costs ~$0/mo at our scale. The goal is that every PR produces evidence: tests run, logs are structured, errors are traceable end-to-end.

## Motivation

Today: 28 tests across `shared/` and `api/` (per README). Strengths: pure-TS WPM and streak math are well covered. Gaps:

- No integration test exercises a real DDB code path; mocks can drift from `aws-sdk-client` semantics.
- Handlers `console.log` ad-hoc; CloudWatch logs are unstructured, request-IDs aren't propagated.
- No metrics: we can't answer "p95 attempt-post latency last week" without manual log mining.
- No tracing: a slow daily-get can't be attributed to scan vs PutItem without instrumentation.

## Goals

- Each layer has a clear test type and runs in seconds locally.
- Every log line is JSON, includes `requestId` and `route`, never includes secrets.
- A small set of CloudWatch metrics (≤8) covers SLOs.
- AWS X-Ray traces enabled with sampling that keeps cost negligible.

## Non-goals

- Not a full APM (Datadog/Sentry). Add later if scale demands.
- Not 100 % coverage targets. Coverage tracked but not enforced as a gate.

## Design

### Test layers

| Layer | Tool | Where | Runs in |
|---|---|---|---|
| Unit (pure logic) | `bun test` | `shared/`, `api/src/repos/keys.test.ts` | local + CI |
| Handler (in-memory repos) | `bun test` | `api/test/handlers/*.test.ts` | local + CI |
| Repo conformance — in-memory | `bun test` | `api/test/repos/*.test.ts` | local + CI |
| Repo conformance — DDB Local | `bun test` (gated by `RUN_DDB_TESTS=1`) | same files | CI nightly |
| E2E web | Playwright | `web/e2e/` | CI on `main` only |

`bun test` already supports the first three; DDB Local needs a docker-compose helper at `infra/test/docker-compose.yml`.

### Structured logging

`api/src/lib/logger.ts`:

```ts
export type Logger = {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, err?: unknown, fields?: Record<string, unknown>): void;
};
export function makeLogger(base: { requestId: string; route: string }): Logger;
```

Every log line is one JSON object: `{ ts, level, msg, requestId, route, ...fields }`. `error` serialises `err.name`, `err.message`, **never** `err.stack` (drops PII risk; we have X-Ray for stacks).

### Metrics

Emitted via CloudWatch Embedded Metric Format (EMF) — no extra cost beyond log ingest. One namespace `CodeType`, dims `Route`, `Outcome`:

| Metric | Unit | Source |
|---|---|---|
| `RequestCount` | Count | every request |
| `RequestLatencyMs` | Milliseconds | edge of `withErrorEnvelope` |
| `ErrorCount{code}` | Count | error envelope |
| `AttemptsCheatFlagged` | Count | spec 007 score≥0.5 |
| `LbWrites` | Count | spec 005 LB upsert |
| `DailySelfSeed` | Count | `daily-get` cold-cache miss |
| `DdbThrottles` | Count | from SDK error name |
| `ColdStarts` | Count | first invocation flag |

### Tracing

- Enable X-Ray in SAM (`Tracing: Active` on each function).
- `aws-xray-sdk-core` patches the DDB doc client. Subsegments around repo calls are auto-created.
- Sampling: 1 req/s + 5 %. Free tier covers 100k traces/mo.

### CI gates

GitHub Actions matrix:
1. `bun install && bun run typecheck`
2. `bun test`
3. `bun --filter @codetype/web build` (catches static-export regressions)
4. (nightly) DDB-Local conformance + Playwright E2E.

## Alternatives considered

1. **Pino for logging.** Standard, but ~80 KB; we want <5 KB Lambda overhead. Hand-rolled logger is 40 lines.
2. **PostHog / Sentry SDK in Lambda.** Adds ~150 KB and an init cost per cold start. Defer until product needs it.

## Risks & mitigations

- **DDB Local divergence** from real DDB (transactions, GSI eventual consistency). Mitigation: nightly run flags drift; in-memory impl is the canonical test target for CI speed.
- **Log volume cost.** EMF inflates log size. Mitigation: 14-day retention on CloudWatch log groups via SAM property.

## Implementation appendix

### File additions

- `api/src/lib/logger.ts`
- `api/src/lib/metrics.ts` (`emitEmf({route, outcome, latencyMs, ...})`).
- `api/src/middleware/with-logger.ts` (creates logger from `requestId` + route).
- `api/test/handlers/*.test.ts` per handler.
- `api/test/repos/contract.ts` + per-repo files (in-memory + DDB versions of the same suite).
- `infra/test/docker-compose.yml` (DDB Local + admin UI on `:8001`).
- `.github/workflows/ci.yml`, `.github/workflows/nightly.yml`.

### SAM changes

```yaml
Globals:
  Function:
    Tracing: Active
    LoggingConfig:
      LogFormat: JSON
      ApplicationLogLevel: INFO
      SystemLogLevel: WARN
```

### Test plan (this spec's own)

- `logger.test.ts` — asserts no field named `password|token|cookie|authorization` ever passes through.
- `metrics.test.ts` — EMF JSON shape conforms to AWS spec.
- `ci.yml` dry-run: PR with deliberately broken type → CI red.
