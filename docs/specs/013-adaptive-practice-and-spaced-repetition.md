---
status: Draft
author: -
created: 2026-05-08
updated: 2026-05-08
supersedes: -
superseded-by: -
---

# 013 — Adaptive practice & spaced repetition

## Summary

Replace the current "random snippet from the language pool" picker with an **adaptive selector** that targets the user's weakest **bigrams** and **symbol classes** (e.g. `=>`, `::`, `!=`, indentation runs). Errors and slow keystrokes from each attempt feed a per-user error model; the next snippet is chosen to maximise *expected practice value* against that model. Ships with a "drill" mode that generates synthetic micro-snippets (≤10 lines) targeting the top-3 weakness clusters.

## Motivation

Current `snippet-get` is uniform-random within a language. That's fine for variety but defeats the stated product goal in `README.md` ("drill the symbols, indentation patterns, and keywords that dominate everyday programming"). Heavy users plateau after ~30 attempts because they keep rolling whatever snippet, not the snippet that would teach them something.

What's already in place (and missing) makes this cheap to add:

- We already record per-attempt `chars_total`, `errors`, and (after spec 007) the full timeline. The error model is a function of data we already have.
- `shared/src/wpm.ts` is pure; an `errors-by-bigram` analyser is a sibling pure module — easy to test, easy to ship.
- Snippet selection is one handler (`snippet-get.ts`); adaptation is a strategy swap, not a new architecture.

## Goals

- Selection is **per-user** but does *not* require a hot read on every request — the model is precomputed and stored on the profile.
- Default behaviour for new users: uniform random (no cold-start weirdness; the model "warms up" after ~5 attempts).
- A "drill" mode the user explicitly opts into; the daily challenge stays uniform across users (deterministic per spec/README).
- Pure, reusable analysis: same `analyse-errors` function runs server-side (model update) and client-side (live "you're struggling with `=>`" hint).

## Non-goals

- Not a true spaced-repetition algorithm (SM-2/Anki). Bigram-weighted sampling is dramatically simpler and fits the domain better — typing skill is *motor*, not *recall*.
- Not LLM-generated snippets. Drill snippets are templated from a curated set of *symbol patterns* per language.
- Not a new training mode for the daily challenge — that remains shared and deterministic.

## Design

### Error model

A compact per-user struct stored on PROFILE:

```ts
type ErrorModel = {
  v: 1;
  updated_at: string;
  // top-K bigrams ordered by error rate; K=32
  bigrams: Array<{ b: string; weight: number }>;     // weight ∈ [0,1]
  // symbol classes: "arrow", "double-colon", "indent", "string-template", ...
  classes: Array<{ c: string; weight: number }>;
  // count of attempts merged into the model
  attempts_merged: number;
};
```

Updated at attempt-recorded time (synchronously in v1; via spec 011 events in v2). Update rule:

```
new_weight = clamp(0.7 * old_weight + 0.3 * fresh_rate, 0, 1)
```

Exponential-moving-average so a single bad attempt doesn't dominate, but a fixed weakness persists.

`fresh_rate` per bigram = `errors_on_bigram / occurrences_in_snippet` from this single attempt's timeline.

### Selection algorithm

Inputs: `lang`, `pool` (active snippets in language), `model` (user's error model), `mode ∈ {"adaptive","random","drill"}`.

```ts
// adaptive: weight each candidate snippet by its overlap with the user's high-weight bigrams/classes
score(snippet, model) =
  Σ (model.bigrams[b].weight × occurrences(snippet, b))
+ 0.5 × Σ (model.classes[c].weight × hasClass(snippet, c) ? 1 : 0)
- 0.1 × repetition_penalty(snippet, last_5_attempts)
```

Then sample with probability ∝ `softmax(score, T=0.7)` — not argmax, so the selection is varied but *biased* toward weakness. Temperature `T` is tunable; `T → 0` is greedy, `T → ∞` is uniform random.

### Drill mode

`/snippets/drill?lang=&class=` returns a *synthesised* short snippet. Source is `data/drills/<lang>/*.tmpl` — small templates with placeholders:

```
// drills/js/arrow.tmpl
const {{name}} = ({{a}}, {{b}}) => {{a}} {{op}} {{b}};
```

Filled from a per-template token bag at request time. Deterministic per `(user, day, class)` so the user can practise the same drill twice without reload weirdness; non-deterministic across days.

### Storage

- ERROR_MODEL is stored *on the profile* (`PK=USER#<sub>, SK=PROFILE`) under `error_model`. One additional attribute, ≤2 KB.
- Drills are not stored in DDB — they're synthesised on the fly. No item churn.
- Snippet pool reads stay as-is (spec 003's `SnippetsRepo.listByLang`).

### API additions

| Method | Path | Notes |
|---|---|---|
| `GET` | `/snippets/next?lang=&mode=adaptive` | new; old `GET /snippets/:id` stays |
| `GET` | `/snippets/drill?lang=&class=` | new |
| `GET` | `/profile/error-model` | new; returns the model for client-side hints |

### Invariants preserved

- Daily challenge is unchanged — deterministic per UTC date, identical across users.
- Server-side model update; client-supplied error rates are advisory only.
- Selection is per-user and uses `sub` from the JWT (auth boundary unchanged).

## Alternatives considered

1. **Server-side ML (logistic regression per user).** Too much for a single-user free-tier app; the EMA model captures 90 % of the value with 5 % of the code.
2. **Compute model on every request from raw attempts.** Re-scans the user's history each time; expensive and slow as history grows. Storing the model on the profile is O(1) read.
3. **Client-side selection.** Trivially gameable; defeats the leaderboard promise of "everyone plays comparable distributions". Selection stays server-side.
4. **Use the same `next` endpoint for daily.** Conflates two contracts (deterministic vs personalised) — kept separate.

## Risks & mitigations

- **Cold start.** New users have no model → selection falls back to uniform random until `attempts_merged ≥ 5`. The UI labels mode "warming up".
- **Plateau on a small pool.** If the active snippet pool is small for a language, adaptive selection may oscillate between 2-3 snippets. Mitigation: when softmax entropy < 1 bit, blend in 30 % uniform random.
- **Model staleness after a long break.** `weight *= 0.95` decay applied lazily on read if `updated_at` > 14 days ago.
- **Privacy.** The error model is per-user; nothing about it leaks through the leaderboard.

## Implementation appendix

### New shared module

```ts
// shared/src/error-model.ts (pure)
export type ErrorModel = /* ... */;
export type AnalyseInput = { snippet: string; timeline: Timeline; errors: number };
export function analyseAttempt(i: AnalyseInput): { bigrams: Map<string, number>; classes: Map<string, number> };
export function mergeModel(prev: ErrorModel | undefined, fresh: ReturnType<typeof analyseAttempt>, now: Date): ErrorModel;
export function scoreSnippet(snippet: string, model: ErrorModel): number;
export function pickSnippet(pool: Snippet[], model: ErrorModel, rng: () => number, T: number): Snippet;
```

### Use-case (per spec 012)

```ts
// api/src/core/use-cases/get-next-snippet.ts
export const getNextSnippet = (d: { snippets: SnippetsPort; profile: ProfilePort; rng: RngPort }) =>
  async (input: { sub: string; lang: Language; mode: "adaptive"|"random" }) => { /* ... */ };
```

### Class definitions per language

```
shared/src/symbol-classes/
  js.ts     // arrow, template-literal, optional-chain, null-coalesce, destructure, ...
  ts.ts     // (extends js) generics, type-assert, satisfies, ...
  go.ts     // short-decl :=, channel <-, gofmt-tab, ...
  py.ts     // indent-step, fstring, decorator, walrus, ...
  c.ts      // pointer-deref *, struct-arrow ->, preprocessor, ...
```

Each module exports `(snippet: string) => Map<ClassName, number>` (occurrence counts).

### UI

- Play page: mode toggle (`Adaptive | Random | Drill`). Default Adaptive once `attempts_merged ≥ 5`.
- Result card: "next up: targets your `=>` weakness" — uses the same `scoreSnippet` to explain selection.
- Profile page: "Your top weaknesses" widget, top 5 bigrams + classes, sourced from `/profile/error-model`.

### Test plan

- **Unit (analyseAttempt):** golden timeline + snippet → expected bigram counts.
- **Unit (mergeModel):** EMA convergence; decay path; first-merge cold-start.
- **Unit (pickSnippet):** with seeded RNG, asserts deterministic output; high-T → near-uniform; low-T → near-greedy.
- **Property test:** for any `(model, pool)`, `scoreSnippet >= 0` and selection probability sums to 1.
- **Integration:** record 10 attempts with consistent `=>` errors → model's arrow-class weight crosses 0.6; selection now favours arrow-heavy snippets.
- **Cold-start:** new user, 4 attempts → mode reports "warming up"; 5th attempt → mode flips to adaptive.
