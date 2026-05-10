---
status: Implemented
author: -
created: 2026-05-08
updated: 2026-05-10
supersedes: -
superseded-by: -
---

# 011 — Domain events via DynamoDB Streams

## Summary

Introduce a thin **domain-event** layer driven by DynamoDB Streams. Handlers stay synchronous and small; everything that today is a "second write after the first write" (leaderboard upsert in spec 005, achievement unlocks in spec 015, streak rollup hardening, future webhooks) moves behind a single event Lambda that consumes the stream, dispatches typed events, and runs idempotent projectors. This is the architectural seam the existing handlers are quietly missing.

## Motivation

`attempts-post.ts` already does too much: validate → recompute WPM → put attempt → bump streak → (spec 005 wants) update leaderboard → (spec 015 wants) check achievements → (future) send a webhook. Each addition makes the cold path slower, fragments idempotency, and grows the blast radius of a single handler bug. Every "second write" is also a place where partial failure leaves the system inconsistent (attempt saved, leaderboard not updated) with no replay story.

Concrete pressure points already in the code:

- `api/src/handlers/attempts-post.ts:55-118` — single function owns persistence + streak; spec 005's LB write would push it past 200 lines.
- `api/src/handlers/submissions-approve.ts` — approval needs to "promote" a submission to a snippet *and* notify the submitter; today it would have to do both inline.
- No retry surface. If a downstream call fails, the originating handler has to choose between failing the user-visible request or silently dropping the side effect.

## Goals

- One canonical pipeline for "things that happen *because* an attempt/submission/profile changed".
- Event consumers are **idempotent** and **independently retryable** (Lambda-builtin via Streams + DLQ).
- Originating handlers shrink: they own their write, they don't own their consequences.
- Adding a new consumer is a new file + a new event type — never an edit to the originating handler.

## Non-goals

- Not introducing EventBridge or SNS yet. DDB Streams → Lambda is sufficient and free-tier-friendly. EventBridge becomes interesting when we cross-account-fan-out (out of scope).
- Not making *all* handler logic async. The user-visible WPM/streak result must still be returned in the original response — that path stays synchronous.
- Not building an event store. Streams retains 24 h; we treat events as a transport, not as the source of truth (the table is).

## Design

### Event taxonomy

One event type per *meaningful state transition*, named in past tense:

| Event | Source item | Triggered by |
|---|---|---|
| `AttemptRecorded` | ATTEMPT (INSERT) | `attempts-post` |
| `ProfileUpdated` | PROFILE (MODIFY/INSERT) | `profile-upsert` |
| `SubmissionApproved` | SUBMISSION → status=approved (MODIFY) | `submissions-approve` |
| `SubmissionRejected` | SUBMISSION → status=rejected (MODIFY) | `submissions-reject` |
| `SnippetRetracted` | SNIPPET (REMOVE) | `snippet-retract` |

Event payload is the **NEW image** plus a derived `event` field already present on items (`entity`) — no separate event marshalling. This keeps the table the single source of truth and removes a serialization layer.

### Topology

```
DynamoDB table ──Streams (NEW_AND_OLD_IMAGES)──▶ events.ts Lambda
                                                   │
                                                   ├─▶ projector: leaderboard   (spec 005)
                                                   ├─▶ projector: achievements  (spec 015)
                                                   ├─▶ projector: streak-audit  (this spec)
                                                   └─▶ projector: webhooks      (future)
```

One Lambda, one stream, fan-out *inside* the Lambda. This keeps cold-start cost low and makes ordering per `PK` trivial (Streams already orders by item key).

### `events.ts` Lambda

```ts
// api/src/handlers/events.ts
export const handler: DynamoDBStreamHandler = async (e) => {
  const events = e.Records.map(decode).filter(isDomainEvent);
  for (const ev of events) {
    await Promise.allSettled(projectors.map(p => p.handle(ev, ctx)));
  }
};
```

`Promise.allSettled` because a failing projector should not poison the others. Each projector exposes:

```ts
interface Projector {
  name: string;
  handles: DomainEventType[];        // declarative dispatch table
  handle(event: DomainEvent, ctx: ProjectorCtx): Promise<Result<void, ApiError>>;
}
```

### Idempotency

Every projector write must be conditional. Patterns:

- **Leaderboard projector** (spec 005): keyed `Put`/`Delete` with `ConditionExpression` already in the spec — unchanged.
- **Achievement projector** (spec 015): item key is `USER#<sub> / ACHIEVEMENT#<id>`; `attribute_not_exists(SK)` makes re-delivery a no-op.
- **Streak-audit projector**: re-derives streak from last 7 days of attempts and writes only if it differs from the stored value (`ConditionExpression: streak_value = :expected`).

### Replay & retry

- Stream-level retry is handled by Lambda (default 24 h, exponential).
- A **DLQ** (SQS, free-tier-fits) is wired to the event Lambda so persistent failures are inspectable.
- A `scripts/replay-events.ts` script reads ATTEMPT items in a `from..to` range and synthesises events through the same projector path — used for backfills (e.g. when adding a new achievement type).

### Invariants preserved

- Auth boundary unchanged: events carry `sub`; projectors that write per-user data construct `PK = USER#<sub>` from the event payload, never trust an external argument.
- Idempotent writes — every projector uses `ConditionExpression`.
- Server WPM recompute happens on the synchronous path; events carry already-recomputed values.

## Alternatives considered

1. **Inline orchestration in the originating handler.** Status quo. Rejected — see motivation.
2. **EventBridge with a custom bus.** Cleaner cross-cutting but adds cost and an extra IAM surface. Reconsider if/when we need cross-service fan-out.
3. **TransactWriteItems for "attempt + LB + streak".** Forces a 4-item transaction on every attempt — costs 2× WCU and locks us into a single-handler future. Rejected.
4. **Step Functions.** Overkill for sub-second projections.

## Risks & mitigations

- **Eventual-consistency confusion.** A user could finish an attempt and not yet see the LB updated. Mitigation: UI explicitly says "leaderboard updates within ~60 s" on the result card, and the result card optimistically shows the new score for the user's *own* row.
- **Storm-on-deploy.** A new projector deployed against an existing table sees no events until something happens. Mitigation: `replay-events.ts` for explicit backfill.
- **Projector ordering** within a single record. `Promise.allSettled` is unordered; if two projectors share an SK (they shouldn't), we'd race. Mitigation: enforce in code review that SK namespaces don't overlap; conformance test asserts disjoint key prefixes per projector.
- **Stream throughput.** At our scale (one user) the stream is essentially idle. At hypothetical 10× growth a single Lambda still handles it; if not, switch to `ParallelizationFactor=10`.

## Implementation appendix

### New module layout

```
api/src/events/
  decode.ts            # DDB stream record → DomainEvent | null
  types.ts             # DomainEvent union, Projector interface
  projectors/
    leaderboard.ts
    achievements.ts
    streak-audit.ts
  index.ts             # registers all projectors

api/src/handlers/events.ts   # the Lambda entrypoint
```

### Stream wiring (CDK)

```ts
// infra/lib/api-stack.ts (sketch)
const eventsFn = new NodejsFunction(this, "EventsFn", { entry: "api/src/handlers/events.ts" });
eventsFn.addEventSource(new DynamoEventSource(table, {
  startingPosition: StartingPosition.LATEST,
  batchSize: 25,
  retryAttempts: 5,
  onFailure: new SqsDlq(dlq),
  bisectBatchOnError: true,
}));
table.grantStreamRead(eventsFn);
```

The DDB table needs `stream: StreamViewType.NEW_AND_OLD_IMAGES` — a one-time CDK property change (no data migration).

### Backfill script

```ts
// scripts/replay-events.ts
//   bun run scripts/replay-events.ts --pk USER#<sub> --from 2026-01-01 --to 2026-05-01 --projector achievements
```

Reads attempts via the same `AttemptsRepo.listByUser` (spec 003), synthesises an `AttemptRecorded` per item, calls the named projector directly. Idempotent by construction — projectors use conditional writes.

### Test plan

- **Unit (decode):** every Streams `eventName` × `entity` combination → expected `DomainEvent | null`.
- **Unit (each projector):** in-memory repo (spec 003) + golden event → asserted writes.
- **Conformance:** "two deliveries of the same event = same end state" (run projector.handle twice, snapshot table state after each, assert equal).
- **Integration:** local DDB Streams via `dynamodb-streams-local` (CI-only, gated by `RUN_DDB_TESTS=1`).
- **Soak:** synthesise 10 000 attempts via `replay-events.ts`; assert wall-clock < 60 s and DLQ stays empty.
