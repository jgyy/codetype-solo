---
status: Draft
author: -
created: 2026-05-07
updated: 2026-05-07
---

# 005 — Opt-in public leaderboards

## Summary

Add an **opt-in** public leaderboard: per language, top 50 by `wpm_scaled` over a rolling 7-day window. Users opt in via profile (`leaderboard_optin: true`) and choose a public display handle. Default is off — preserving the README's "single developer" framing for everyone who doesn't opt in.

## Motivation

Solo practice loses momentum after the streak resets a few times. Anonymous-by-default leaderboards add a low-stakes social signal without compromising the per-user privacy model. This is also the first feature that exercises a multi-user read path, so it's a useful forcing function for the repository pattern (spec 003).

## Goals

- Opt-in only. A user who never touches profile settings is invisible.
- Server enforces opt-in *and* min-evidence: a user must have ≥3 attempts in the window to appear (kills single-fluke runs).
- Read path is cheap: one `Query` against a sparse GSI, paginated.
- No PII: the leaderboard exposes a `handle` (free-form, ≤24 chars) and stats. Never `sub`, `email`, or any identifier that ties back to Cognito.

## Non-goals

- Real-time updates. Eventual (≤60 s) is fine; we'll precompute on attempt-put.
- All-time / global leaderboards. Out of scope; rolling 7-day only.
- Friend lists, follows, comments. Not now.

## Design

### Data model (single-table additions)

New entity `LB_ENTRY` lives in a sparse partition keyed by language and ISO week:

| field | value |
|---|---|
| PK | `LB#<lang>#<yyyy-Www>` |
| SK | `WPM#<paddedScaled>#<sub>` (e.g. `WPM#0093.4#abc-...`) |
| entity | `LB_ENTRY` |
| handle | string |
| wpm_scaled | number |
| attempts_in_window | number |
| updated_at | ISO |

`paddedScaled` is `wpm_scaled.toFixed(1).padStart(6, "0")` so lexicographic SK order = numeric order. Read top-N via `Query(... ScanIndexForward=false, Limit=50)`.

### Write path

On `POST /attempts` success, **after** the put, the handler reads the user's profile (cached in-Lambda for the cold-Lambda lifetime, ≤5 min) and if `leaderboard_optin === true`, computes the user's best `wpm_scaled` over the last 7 days from `GSI1` and **conditionally** updates the LB entry:

- If no entry: `Put` with `attribute_not_exists(PK)`.
- If entry exists with lower `wpm_scaled`: `Delete` old SK + `Put` new SK in a `TransactWriteItems` (the SK encodes the score so improvements require a key change).
- If entry exists with higher score: no-op.

`attempts_in_window < 3` ⇒ the entry is *deleted*, not written, so the public list never shows under-evidenced rows.

### Read path

`GET /leaderboard?lang=js[&week=2026-W19]` →

```json
{ "ok": true, "data": { "lang": "js", "week": "2026-W19", "entries": [
  { "rank": 1, "handle": "kestrel", "wpm_scaled": 93.4, "attempts": 12 }, ...
] } }
```

`week` defaults to current ISO week (UTC). One `Query` per request. No pagination beyond top-50 (intentionally bounded to keep the surface and the cost predictable).

### Privacy & abuse model

- **Handle uniqueness** is *not* enforced — collisions are allowed. The display has no follow/DM, so impersonation is low-stakes; we'll revisit if user feedback says otherwise.
- **Bad-word filter** runs on `handle` set/update with a small static list (`shared/src/handle-blocklist.ts`). Reject with `bad_request`.
- **Cheating mitigation** lives in spec 007 (replay/anti-cheat). Until 007 lands, the leaderboard prominently displays "early access — no cheat detection yet" in the UI.

### Invariants preserved

- Per-user data is still under `PK = USER#<sub>`. The leaderboard partition (`LB#...`) is fundamentally different and read-only for non-owners (no PutItem path exposes another user's `sub`).
- Idempotent writes (the LB transact-write uses condition expressions on both Delete and Put).
- Server recomputes WPM (the LB only reads server-stored `wpm_scaled`, never trusts client values directly).

## Alternatives considered

1. **Always-on leaderboards.** Violates current product framing and creates a sign-up incentive misalignment. Rejected.
2. **Materialized via DDB Streams + Lambda.** Cleaner separation, but adds cost and a new failure surface for negligible latency benefit at our scale. Rejected for v1; revisit if write throughput grows.
3. **All-time leaderboard.** Encourages farming a single perfect run forever. Rejected.

## Risks & mitigations

- **Hot partition** for a popular language. Top-50 reads of `LB#js#<week>` are cheap, but writes on every attempt could hot-spot. Mitigation: writes only on personal-best improvement (most attempts → no-op).
- **Handle squatting.** Rate-limit handle changes (≤1 per 24 h) via `profile.handle_changed_at`.
- **Profile read amplification.** The post-attempt path reads profile each time. Mitigation: in-Lambda LRU cache keyed by `sub`, TTL 60 s.

## Implementation appendix

### New endpoints

| Method | Path | Auth |
|---|---|---|
| `GET`  | `/leaderboard?lang=&week=` | none (public) |
| `PUT`  | `/profile` (existing — extend) | required |

### New profile fields

```ts
type Profile = {
  // existing
  display_name?: string;
  // new
  handle?: string;             // ≤24 chars, [a-z0-9_-]+
  leaderboard_optin: boolean;  // default false
  handle_changed_at?: string;
};
```

### New repo

```ts
interface LeaderboardRepo {
  upsertEntry(lang: Language, week: string, entry: LbEntry): Promise<Result<void, ApiError>>;
  removeEntry(lang: Language, week: string, sub: string): Promise<Result<void, ApiError>>;
  topN(lang: Language, week: string, n: number): Promise<Result<LbEntry[], ApiError>>;
}
```

### Web changes

- New page `web/src/app/leaderboard/page.tsx` (static; data fetched client-side, since `/leaderboard` is public).
- Profile settings modal: opt-in toggle + handle input.
- `ResultCard.tsx`: small "submitted to leaderboard" indicator after a personal-best.

### Test plan

- Unit: SK padding round-trip (`WPM#0093.4#x` < `WPM#0103.0#y`).
- Repo conformance: `topN` returns descending; `removeEntry` no-ops if absent.
- Handler test: opt-out user post-attempt → no LB write.
- Handler test: post-attempt with score below personal-best → no LB churn.
- Concurrency test: two simultaneous improvements for same user → exactly one entry remains, with the higher score.
