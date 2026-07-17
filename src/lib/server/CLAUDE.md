<!-- src/lib/server/: everything that touches secrets, the DB, or Claude.
     Repo-wide rules (commands, style, git etiquette) live in the root AGENTS.md
     and load alongside this — don't repeat them here. This file only adds the
     conventions specific to this directory. -->

# src/lib/server/ — secrets, data, and the Claude call site

Never import anything from this directory into a `.svelte` component or any
client-only file — everything here runs server-side only (DB credentials,
`SESSION_SECRET`, `APP_PIN` hash, `ANTHROPIC_API_KEY`).

## Files
| File | Owns |
|---|---|
| `session.ts` | HMAC-signed session cookie, `verifyPin` (constant-time) |
| `hint-guardrails.ts` | `checkHintRequest` (pre-call) + `sanitizeHint` (post-call) for the only Claude call site |
| `db/schema.ts`, `db/index.ts` | Drizzle schema + libSQL client |
| `mastery.ts` + `sm2.ts` | SM-2 scheduler: `classifyOutcome` → `nextSchedule` → `topic_mastery` update |
| `backup.ts` | JSON export/import (import is destructive — wipes tables first) |
| `rate-limit.ts` | In-memory PIN backoff + hint rate limit |
| `attempt-status.ts` | Pure attempt-status transition rules (`in_progress` → terminal, one-way) |

## Invariants
- **PIN compare is constant-time.** Use `verifyPin` from `session.ts`. Never `===` two hashes.
- **Session cookies stay stateless**: `<expiry>.<sig>` HMAC-SHA256 over `SESSION_SECRET`, no server-side session table.
- **SM-2 quality comes from outcome (`unaided`/`hinted`/`gave_up`), never speed.** There is no WPM/accuracy signal anywhere in this app — don't add one to the quality function; that's the `codetype-race` product, not this one.
- **Any new Claude call path routes through `checkHintRequest` + `sanitizeHint`.** Adding a guardrail regex is fine; removing one needs a security review.
- **SQL lives in `db/` only**, expressed through the Drizzle schema — no raw string SQL in `mastery.ts`/`backup.ts`/route handlers.
- **Hint text is never persisted verbatim** — only `level` and a timestamp (privacy/cost).

## Testing
Tests are colocated as `<module>.spec.ts` (note: **`.spec.ts`, not `.test.ts`** — the root AGENTS.md's stated `*.test.ts` convention is aspirational for new UI code; this directory's existing suite uses `.spec.ts` and new server-module tests should match it, not the doc). Run a single file while iterating: `npx vitest run src/lib/server/<module>.spec.ts`.
