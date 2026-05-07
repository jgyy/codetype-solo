---
status: Draft
author: -
created: 2026-05-07
updated: 2026-05-07
---

# 006 — User snippet submission with moderation queue

## Summary

Let authenticated users submit code snippets (≤400 chars, one of the supported languages). Submissions enter a `PENDING` state visible only to the submitter and moderators; on approval they become available globally and to the daily-challenge pool.

## Motivation

Today snippets are seeded once from `data/snippets/*.json` (`infra/scripts/seed.ts`). The pool stales out, and new languages or idioms can only be added via a redeploy. Letting users contribute (gated by review) keeps content fresh without a deploy.

## Goals

- Submit endpoint is authenticated and rate-limited (≤5 per user per day).
- Submissions are explicitly typed as `PENDING | APPROVED | REJECTED`.
- Approval is a single moderator action; the moderator is identified by a `MOD#<sub>` group claim in Cognito.
- Approved submissions become indistinguishable from seed data (same entity, same access patterns) so existing handlers (`snippet-get`, `daily-get`) keep working.

## Non-goals

- No threaded review/comments. Reject reason is a free-form string.
- No diff-edit by moderators. Reject + resubmit cycle.
- No cross-language detection. Submitter declares language; we trust it (will be validated in a future spec via tree-sitter).

## Design

### Lifecycle

```
client → POST /snippets/submissions  (status=PENDING)
mod    → POST /snippets/submissions/:id/approve   → write SNIPPET row + mark submission APPROVED
mod    → POST /snippets/submissions/:id/reject    → mark REJECTED with reason
```

### Data model

New entity `SUBMISSION`:

| field | value |
|---|---|
| PK | `SUBMISSIONS` (single hot partition for mod queue — bounded by submission rate) |
| SK | `STATUS#<status>#<created_at>#<id>` |
| GSI1PK | `USER#<sub>` |
| GSI1SK | `SUBMISSION#<created_at>` |
| entity | `SUBMISSION` |
| status | `PENDING \| APPROVED \| REJECTED` |
| code, language, title, submitter_sub, reject_reason?, decided_at?, decided_by? | … |

The mod queue is a `Query(PK = "SUBMISSIONS" AND begins_with(SK, "STATUS#PENDING#"))` — naturally chronological.

### Approval write

`approve` does a single `TransactWriteItems`:

1. `Put` a new `SNIPPET` row with a derived id `sub-<short-uuid>`.
2. `Update` the `SUBMISSION` row: `status=APPROVED`, append `SK` rewrite via Delete+Put (status is part of SK).
3. Condition: `status = PENDING` on the submission.

### Rate limit

Per-user submission count is bounded by counting submissions in the last 24 h via `GSI1` (`USER#<sub>` + `SUBMISSION#`). The handler refuses with `rate_limited` if ≥5.

### Auth model

- Submitter: any authenticated user.
- Moderator: JWT must include `cognito:groups` containing `mods`. `withAuth({ required: true, group: "mods" })` enforces.

### Invariants preserved

- Approved snippets occupy the same `SNIPPET` partition and shape used by `seed.ts` and `daily-get.ts`.
- Daily-challenge selection (`daily-get.ts:hashDate`) is unchanged; new approvals naturally enter the pool when they become `entity = SNIPPET`.
- Idempotent writes: approval transaction uses condition expressions; double-clicking "approve" is a no-op.

## Alternatives considered

1. **Approve in-place by mutating the submission row.** Means handlers must filter `SNIPPET` AND `SUBMISSION` rows for browse. More moving parts. Rejected.
2. **GitHub PR-based moderation** (data file + auto-deploy). Simpler infra, but defeats the purpose of avoiding redeploys. Rejected.

## Risks & mitigations

- **Quality of approved snippets.** The `seed.ts` snippets are hand-curated; user-submitted ones may be lower quality. Mitigation: submitters and approvers are both tracked; a future spec can add per-snippet ratings to deprioritise low-quality entries.
- **Daily-challenge poisoning** (a mod approves an offensive snippet). Mitigation: an emergency `POST /snippets/:id/retract` endpoint that flips `entity` to `SNIPPET_RETIRED`, removing it from `daily-get` selection without deleting history.
- **Hot partition `PK=SUBMISSIONS`.** Bounded by 5 submissions/user/day; a 1000-user spike is 5k items, well within DDB single-partition limits.

## Implementation appendix

### New endpoints

| Method | Path | Auth |
|---|---|---|
| `POST` | `/snippets/submissions` | user |
| `GET`  | `/snippets/submissions?mine=true` | user |
| `GET`  | `/snippets/submissions?status=PENDING` | mod |
| `POST` | `/snippets/submissions/:id/approve` | mod |
| `POST` | `/snippets/submissions/:id/reject` | mod |
| `POST` | `/snippets/:id/retract` | mod |

### Submission schema (Zod)

```ts
SubmissionBody = z.object({
  language: z.enum(["js","py","c","go"]),
  title: z.string().min(3).max(80),
  code: z.string().min(20).max(400),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});
```

### Repo additions

```ts
interface SubmissionsRepo {
  put(s: NewSubmission): Promise<Result<{ id: string }, ApiError>>;
  listPending(): Promise<Result<Submission[], ApiError>>;
  listByUser(sub: string, limit: number): Promise<Result<Submission[], ApiError>>;
  approve(id: string, mod: Caller): Promise<Result<{ snippetId: string }, ApiError>>;
  reject(id: string, mod: Caller, reason: string): Promise<Result<void, ApiError>>;
  countLast24h(sub: string): Promise<Result<number, ApiError>>;
}
```

### Test plan

- Unit: SK ordering for `STATUS#PENDING#...` ensures FIFO mod queue.
- Repo: approve transaction atomicity (simulate failure of either Put or Update; both must roll back).
- Handler: rate-limit returns `429` after 5th submission within 24 h.
- E2E (optional Playwright): user submits, mod approves, daily can pick the new snippet.
