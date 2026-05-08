---
status: Draft
author: -
created: 2026-05-08
updated: 2026-05-08
supersedes: -
superseded-by: -
---

# 014 — Real-time multiplayer races

## Summary

Add **head-to-head races**: 2–4 players type the same snippet at the same time, see each other's progress live, and the server declares a winner using server-recomputed WPM. Built on **API Gateway WebSocket API + DynamoDB** (no extra services), with a single "race room" entity per active match. Optional feature, opt-in per attempt; never affects solo stats unless the user explicitly stores the race result.

## Motivation

Solo practice is the core; races are the social hook. They're also the *only* feature that requires a fundamentally different transport (WebSocket) — which makes this spec a natural place to define how that transport coexists with the existing HTTP API rather than letting it grow ad hoc.

The product constraint that shapes this whole design: **everything still has to fit in free tier for one user**. So the WebSocket path is opt-in, idle rooms self-evict, and we never keep persistent connections paid-for when no one is racing.

## Goals

- 2–4 players, same snippet, same start time. Live progress (caret position + accuracy) visible to all participants at ~5 Hz.
- Server-authoritative winner: identical WPM-recompute path as `attempts-post`.
- Zero impact on solo flow when races aren't being used (no idle Lambda invocations, no DDB churn).
- Race results optionally stored as ordinary attempts (so they count for adaptive-practice / leaderboard if the user chose to).

## Non-goals

- Not matchmaking. v1 is **invite-by-code** only (host creates a room → shares a 6-char code → joiners enter the code).
- Not chat. Out of scope.
- Not spectator mode. Only participants see the room.
- Not cross-language races. Everyone in a room types the same snippet in the same language.

## Design

### Transport choice

API Gateway **WebSocket API** with three routes — `$connect`, `$disconnect`, plus a single `action` route that fan-outs based on a `type` field in the message. Cognito JWT is verified at `$connect` (same authoriser library as HTTP); the JWT `sub` is bound to the `connectionId` for the lifetime of the socket. **No anonymous WebSocket sessions** — guests can't race in v1.

### Room lifecycle

| Phase | Trigger | DDB state |
|---|---|---|
| `lobby` | `RACE_CREATE` | room item exists, `participants ≤ host` |
| `countdown` | host sends `RACE_START`, ≥2 participants joined | room.status = `countdown`, `start_at = now + 3s` |
| `running` | wall-clock reaches `start_at` | (no state change; clients drive) |
| `finished` | first non-finishing event after all submit, OR 2 min timeout | room.status = `finished`, frozen results |
| `evicted` | TTL fires (15 min after creation) | item deleted by DDB TTL |

### Data model (single-table, sparse partition)

| field | room item | participant item |
|---|---|---|
| PK | `RACE#<code>` | `RACE#<code>` |
| SK | `ROOM` | `PARTICIPANT#<sub>` |
| entity | `RACE_ROOM` | `RACE_PARTICIPANT` |
| status | `lobby/countdown/running/finished` | – |
| lang | `js/go/py/c` | – |
| snippet_id | id | – |
| start_at | ISO | – |
| host_sub | sub | – |
| ttl | epoch+15m | epoch+15m |
| handle | – | display handle (spec 005) |
| connection_id | – | API Gateway WS conn id |
| progress_chars | – | int (0..len) |
| progress_errors | – | int |
| finished_at | – | ISO or null |
| wpm_scaled | – | server-recomputed at finish |

The TTL on every race row guarantees abandoned rooms self-clean; the table never accumulates stale race state.

### Connection management

- `$connect`: verify JWT (query string `?token=…`), create a CONN item `PK=CONN#<connectionId> / SK=USER#<sub>` with TTL = epoch + 30 min. The CONN item maps connection → user. No room binding yet.
- `RACE_CREATE`: handler creates the ROOM, the PARTICIPANT(host), responds with `code`.
- `RACE_JOIN`: handler verifies room is in `lobby`, < 4 participants, then creates PARTICIPANT(joiner). Broadcast `participant_joined` to all connections in the room.
- `RACE_PROGRESS { chars, errors }`: handler `Update`s the PARTICIPANT's progress fields (no condition; eventual is fine), broadcasts `progress` to all participants. Client throttles to 5 Hz.
- `RACE_FINISH { timeline, totals }`: handler runs the same `recordAttempt` use-case (spec 012), stamps `wpm_scaled` and `finished_at` on the PARTICIPANT. When all participants are finished (or 2 min after the first one), broadcast `race_complete`.
- `$disconnect`: mark the PARTICIPANT (if any) as `dropped: true`; broadcast.

### Broadcast pattern

Connections to notify = `Query(PK=RACE#<code>, SK begins_with PARTICIPANT#)`, then `PostToConnection` per participant. Failures with `GoneException` (410) trigger a soft-delete of the PARTICIPANT. No SNS, no SQS — direct fan-out from the WS handler is fine for ≤4 recipients.

### Anti-cheat & winner determination

- Client `progress` is **display-only**. Final standings come from `RACE_FINISH` payloads — same WPM recompute as solo (`shared/src/wpm.ts`).
- Cheat-flagged finishes (spec 007) still receive a final WPM, but the room marks them `cheat_flagged` and the UI shows a small icon. The "winner" is the highest non-flagged WPM; if all are flagged, no winner is declared.

### Optional persistence

Default: race results are *ephemeral* (DDB TTL deletes them in 15 minutes). The `RACE_FINISH` payload includes `save: boolean`; if true, the participant's run is also written through `recordAttempt` (counts for personal stats, adaptive practice, optionally leaderboard).

### Invariants preserved

- Auth boundary: WS uses the same Cognito JWT; per-user PARTICIPANT items live under the **race partition**, not the user partition, but writes to USER#<sub> data still go through `recordAttempt`.
- Idempotent writes: `RACE_PROGRESS` is last-writer-wins (intentional); `RACE_FINISH` uses `attribute_not_exists(finished_at)` to make reconnect-storms safe.
- Server WPM recompute is the only path to a stored result.

## Alternatives considered

1. **AppSync subscriptions.** Cleaner, but heavier to provision and not free-tier-friendly. Rejected.
2. **Polling-based "races" over the existing HTTP API.** Cheap but feels broken at 5 Hz. Rejected.
3. **Room state in Redis/Momento.** External dependency for marginal latency win. DDB on-demand is fine at this scale.
4. **Anonymous races via guest session token.** Adds a second auth surface; defer until product demand exists.

## Risks & mitigations

- **WS Lambda cold start during countdown.** Pre-warm by sending a no-op `ping` at room create.
- **Disconnect storms.** TTL covers eventual cleanup; broadcast logic ignores `GoneException`. Worst case: a stale PARTICIPANT lingers ≤15 min in DDB and is invisible in the UI.
- **Rate-limit abuse.** Cap `RACE_PROGRESS` per connection to 10 Hz server-side; over-rate messages are silently dropped.
- **Room-code collisions.** 6-char base32 = 1.07e9 namespace; collision handled by `attribute_not_exists(SK)` on room create — retry with a new code.
- **WS billing surprise.** Per-message + per-minute cost. Cap rooms at 4 participants and throttle progress to 5 Hz; break-glass kill-switch via SSM parameter the WS handler reads on connect.

## Implementation appendix

### New module layout

```
api/src/handlers/ws/
  connect.ts
  disconnect.ts
  race-create.ts
  race-join.ts
  race-progress.ts
  race-finish.ts
api/src/core/use-cases/
  create-race.ts
  join-race.ts
  finish-race.ts
api/src/adapters/
  ws/api-gateway-management.ts   # PostToConnection wrapper
```

### CDK additions

```ts
const wsApi = new WebSocketApi(this, "RaceWs", { ... });
new WebSocketStage(this, "Prod", { webSocketApi: wsApi, stageName: "prod", autoDeploy: true });
wsApi.addRoute("$connect",    { integration: new WebSocketLambdaIntegration("c", connectFn) });
wsApi.addRoute("$disconnect", { ... });
wsApi.addRoute("race",        { ... });               // dispatches by message.type
table.grantReadWriteData(connectFn);                  // and others
wsApi.grantManageConnections(progressFn);             // for PostToConnection
```

CDK also adds a TTL attribute on the existing table (`ttl`) — already harmless for non-race items because they don't set it.

### Web changes

- `web/src/app/race/page.tsx` — host page with code generator.
- `web/src/app/race/[code]/page.tsx` — joiner & lobby.
- `web/src/lib/race-client.ts` — WS client, reconnect with exponential backoff, message envelope `{ type, ...payload }`.
- Live caret rendering: per-participant ghost caret over the snippet, coloured by participant.

### Test plan

- **Unit (use-cases):** create/join/finish with in-memory adapters; assert state transitions.
- **WS integration (LocalStack or `serverless-offline-websockets`):** scripted 3-client race; assert each client receives the right broadcasts in order.
- **Failure injection:** force `GoneException` on one connection mid-race → others unaffected, dropped flag set.
- **Soak:** 100 sequential races, assert PARTICIPANT/ROOM items < 50 in steady state (TTL works).
- **Cost test:** scripted race emits ≤80 `progress` messages × 4 participants (well within $0/mo for personal use).
