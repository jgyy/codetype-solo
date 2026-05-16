# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot, etc.) working in this repository.

This repo is **codetype-solo** — the **"For individual use"** submission for the [42 Singapore B1 Builders Programme](docs/B1-Builders-Programme.md) (Batch 1, submission cutoff 15 May 2026). It is a daily code-snippet typing trainer for a single developer. See [`README.md`](./README.md) for the full project overview, demo, and reflection.

---

## 1. Project context an agent must respect

- **Scale:** Individual use. One signed-in user (plus guest mode). Do not introduce multi-tenant features, org/team concepts, or shared-resource flows — those belong to the *team/department* sibling project, not this one.
- **Cost target:** AWS free tier, ~$0/mo. Reject suggestions that add always-on compute (Fargate, EC2, RDS, NAT gateways, Aurora) or paid auth tiers. On-demand Lambda + on-demand DynamoDB + S3 + CloudFront + Cognito free tier only.
- **Stack:** Next.js 16 static export + TypeScript + Tailwind · Bun workspaces. The AWS deployment (Lambda, API Gateway, DynamoDB, Cognito, S3, CloudFront, CDK) has been decommissioned — the codebase now targets local/guest-mode use only. Do not reintroduce IaC without an explicit ask.
- **Workspaces:** `shared/` (pure domain), `web/` (Next.js), `api/` (Lambda handler source, no longer deployed). Keep concerns separated — the pure domain core in `shared/` must remain importable without Next.js or the AWS SDK so `bun test` stays fast.

## 2. Non-negotiable invariants

These were design decisions made deliberately. Do not regress them. If a change would touch any of these, **stop and confirm with the user first.**

| # | Invariant | Why |
|---|---|---|
| 1 | **Auth boundary == storage boundary.** The Cognito JWT `sub` is the DynamoDB partition key (`PK = USER#<sub>`). Handlers must derive `PK` from the verified JWT, never from a request body or query param. | A forged request literally cannot address another user's items. |
| 2 | **Server recomputes WPM and accuracy on every attempt.** Client-supplied numbers are advisory only and set a `wpm_mismatch` audit flag on disagreement. | Client values are untrusted; cheating must be impossible. |
| 3 | **Every `PutItem` carries a `ConditionExpression`.** New items use `attribute_not_exists(PK)` (or `SK`); updates use the appropriate version/state guard. | Network retries no-op instead of duplicating attempts; cold-Lambda races on the daily challenge can't double-write. |
| 4 | **Daily challenge is deterministic + self-seeding.** FNV-1a hash of the UTC date string mod the snippet count, with the read path self-seeding under `attribute_not_exists(SK)`. Do not add a scheduled seeder. | Cheaper than a cron, safe under cold-start fan-out, identical across devices. |
| 5 | **IAM is least-privilege.** The Lambda role is scoped to the four actions actually used (`PutItem`, `GetItem`, `Query`, `UpdateItem`) on the table ARN + index ARNs. Never broaden to `dynamodb:*` or `Resource: "*"`. | A too-broad policy was caught and tightened during review — do not undo it. |
| 6 | **Guest mode must keep working.** When `web/.env.local` is absent, the app runs against `localStorage` and hides the sign-in button. | Lets the app run with zero AWS config for local dev / demo. |
| 7 | **Discriminated unions narrow before field access.** The post-attempt response is a discriminated union; check the discriminant before reading fields. No `as` casts. | A prior bug from unnarrowed access was fixed in `afd9c07`. |

## 3. Commands an agent should use

Use these instead of inventing new ones. Run from the repo root unless noted.

| Task | Command |
|---|---|
| Install | `bun install` |
| Run all tests (28 currently) | `bun test` |
| Type-check all workspaces | `bun run typecheck` |
| Web dev server (guest mode at `:3000`) | `bun --filter @codetype/web dev` |

Deployment commands (`deploy`, `cdk`, `synth`, `diff`, `bootstrap`, `seed`, `outputs`) and the `infra/` workspace have been removed; the AWS stack is no longer provisioned.

## 4. House style

- **TypeScript everywhere.** Shared domain types come from `@codetype/shared`. Don't redefine them in `web/` or `api/`.
- **Pure functions in `shared/`.** No I/O, no AWS SDK imports, no Next.js imports. If logic needs a clock, inject it.
- **TDD for `shared/`.** New domain logic gets a red test in `shared/tests/` before the implementation. WPM and streak follow this convention — keep it.
- **Generated API client is generated.** The contents of `web/src/lib/api-client/` come from `docs/api/openapi.yaml`. Don't hand-edit; regenerate.
- **No new top-level dependencies without justification.** Free-tier and bundle size matter. Prefer the platform / standard library.
- **Comments only when the *why* is non-obvious.** Don't narrate what well-named code already says.
- **Commits:** no `Co-Authored-By: Claude` trailer. Match the existing terse style (`feat:`, `fix:`, `docs:`).

## 5. Verification before claiming done

Before reporting any task complete:

1. `bun test` passes (currently `28 pass · 0 fail`).
2. `bun run typecheck` is clean.
3. For web changes that touch routing, auth, or the API client: load `bun --filter @codetype/web dev` and walk the affected page.
4. For Lambda handler changes: the corresponding `api/tests/handlers/*.test.ts` is updated and passing.

If you can't actually run a verification (e.g. no AWS credentials in this environment), say so explicitly — don't claim success based on type-checking alone.

## 6. How to use AI on this repo (B1 Builders alignment)

The B1 Builders Programme expects students to "use AI to reason, build, test, debug, and improve" and to "be able to explain what the AI did and what you did." When you act as an AI agent here:

- **AI for plumbing, human for invariants.** Generate OpenAPI clients, CDK boilerplate, and handler scaffolds freely. For schema design, IAM scoping, and the invariants in §2, propose changes and wait for human confirmation.
- **Re-read AI output before committing.** The first IAM policy was `dynamodb:*`; the first WPM path trusted the client; both were caught only because the human re-read the diff. Treat your own output with the same suspicion.
- **No sensitive data in public AI tools.** This repo is single-user and contains no PII, but if you need to discuss real Cognito IDs, ARNs, or account numbers with an external AI, redact them.
- **Explain trade-offs in PR descriptions or commit bodies**, not in code comments. The B1 reflection (`README.md` "Reflection" section) is the canonical record of why decisions were made.

## 7. Repo map (for orientation)

```
codetype-solo/
├── shared/   # pure-TS WPM, streak, schemas, anti-cheat (TDD'd)
├── web/      # Next.js 16 static export
├── api/      # 11 Lambda handler source files (Bun-bundled, no longer deployed)
├── data/snippets/    # per-language snippet JSON: c, go, js, py
├── docs/     # plan, specs, OpenAPI contract, B1 programme doc
└── scripts/  # repo-wide tooling (LOC counter, etc.)
```

For deeper context on any feature, the spec lives under `docs/specs/` (see `docs/specs/000-index.md` for the recommended reading order).

---

**Maintenance:** when an invariant changes or a new command is added, update this file in the same commit so future agents inherit the correct rules.
