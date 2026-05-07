---
status: Draft
author: -
created: 2026-05-07
updated: 2026-05-07
---

# 007 — Keystroke replay & anti-cheat

## Summary

Capture a compact keystroke timeline alongside each attempt, store it cheaply, and use it to (a) replay attempts in the UI and (b) run server-side cheat heuristics before an attempt counts toward leaderboards (spec 005). Heuristics are layered, conservative, and explainable — they flag, they don't ban.

## Motivation

The current `attempts-post.ts` server only recomputes WPM from totals (`chars_total`, `errors`, `duration_ms`). That catches *gross* fabrication (impossible WPM) but not subtler patterns: paste, scripted timing, spike-then-rest typing. The leaderboard spec explicitly punted on cheat detection; this spec closes that gap.

## Goals

- Compact timeline payload: target ≤ 4 KB per attempt for a 400-char snippet.
- Server-side heuristics run synchronously in the attempt-post path (must add ≤30 ms p99).
- Heuristics output a **score 0–1** + flag reasons, not a hard reject. UI explains why an attempt was excluded from the LB.
- Replays render purely from the timeline; no server round-trips during playback.

## Non-goals

- Not a full keylogger. Only delta-from-start times + key code + whether the keypress was correct.
- Not blocking attempts from being saved. Cheat-flagged attempts still count for personal stats (the user's own history); they just don't enter the leaderboard.
- Not ML-based detection v1. Hand-tuned heuristics only.

## Design

### Timeline shape

Compressed columnar arrays (better gzip than per-event objects):

```ts
type Timeline = {
  v: 1;
  // milliseconds since start (uint16 fits up to ~65 s; we cap at 5 min and split if needed — but our snippets are <60 s)
  t: number[];
  // key code (printable ASCII or "Backspace" → -1, "Enter" → -2)
  k: number[];
  // 1 if keypress was correct in the typing model, 0 otherwise
  c: (0|1)[];
};
```

Stored as a single attribute `timeline` on the ATTEMPT item (DDB item size cap is 400 KB; 4 KB is comfortable).

### Heuristics (run server-side at attempt-post)

| Heuristic | Signal | Threshold |
|---|---|---|
| **Paste burst** | ≥30 chars within 200 ms | hard flag |
| **Suspicious uniformity** | stdev(inter-key delays) < 8 ms over ≥50 keys | flag |
| **Backspace absence** | 0 backspaces with `errors == 0` and `chars_total > 200` | weak flag |
| **First-keystroke offset** | first `t` < 100 ms (no human reaction time) | flag |
| **End-of-snippet warp** | gap > 5× median between any two consecutive keys | weak flag |

`cheat_score = clamp(weak * 0.2 + flag * 0.5 + hard * 1.0, 0, 1)`. `cheat_score >= 0.5` excludes from leaderboard. The score and `cheat_reasons: string[]` are stored on the attempt.

### UI replay

- New `web/src/components/ReplayPlayer.tsx` consumes a `Timeline` and renders the snippet character-by-character at the recorded pace.
- Time scrubber + 0.5×/1×/2× playback.
- Available from the history page (per attempt) and from `ResultCard` immediately after typing.

### Invariants preserved

- Server still recomputes WPM. Anti-cheat is *additional*, not a replacement.
- Idempotency: timeline is part of the same `Put`, so duplicate posts are still no-ops.
- PK / auth boundary unchanged.

## Alternatives considered

1. **Streaming keystrokes during typing.** Lower payload at end, but a dependency on a sticky connection and adds a server-side WS surface. Rejected for now.
2. **Pure client-side cheat detection.** Trivially bypassed. Rejected.
3. **Store raw event objects.** ~3× larger; provides nothing extra at our resolution. Rejected.

## Risks & mitigations

- **False positives** (fast, consistent typists). Mitigation: `flag` and `weak` only — true accusations require multiple `flag`s combining; a single signal never reaches the 0.5 cutoff.
- **Item-size pressure** if we ever raise snippet length to ~2000 chars. Mitigation: above 1500 chars store timeline in S3 (`timeline_s3_key`) and keep an aggregate digest on the item.
- **Privacy.** Keystroke data is per-user under the user's PK; never exposed in leaderboard reads.

## Implementation appendix

### Schema additions to `PostAttemptBody`

```ts
PostAttemptBody.extend({
  timeline: z.object({
    v: z.literal(1),
    t: z.array(z.number().int().nonnegative()).max(2000),
    k: z.array(z.number().int()).max(2000),
    c: z.array(z.union([z.literal(0), z.literal(1)])).max(2000),
  }).refine(tl => tl.t.length === tl.k.length && tl.k.length === tl.c.length, "timeline arrays mismatched"),
});
```

### New shared module

`shared/src/anticheat.ts` — pure functions, fully unit-tested:

```ts
export type CheatReport = { score: number; reasons: string[] };
export function analyse(tl: Timeline, totals: { chars: number; errors: number; durationMs: number }): CheatReport;
```

Imported by both the API handler (post-validation) and the web client (for live "your run will be flagged" hints during typing — same code, same answer).

### Item changes

ATTEMPT items gain: `timeline` (object), `cheat_score` (number), `cheat_reasons` (string[]).

### LB integration

Spec 005's leaderboard write path adds: `if (cheat_score >= 0.5) skip LB write`. Already-promoted entries are not re-evaluated retroactively (avoids partition churn); a one-shot script can re-score historical attempts if needed.

### Test plan

- Unit per heuristic: golden timelines (paste, robotic, slow human, fast human) with expected scores.
- Performance: synthetic 2000-event timeline `analyse` runs in <5 ms on a Lambda-sized CPU budget.
- Replay component: visual regression test (Playwright screenshot at 50 % playback for a fixed timeline).
