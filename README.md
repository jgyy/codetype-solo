# codetype-solo

A daily code-snippet typing trainer for a single developer. Pick a language, type real code against the clock, get **WPM / accuracy / streak** stats, and watch your progress over time.

> **Stack:** Next.js 15 (static export) + TypeScript + Tailwind · Bun workspaces · AWS Lambda + API Gateway HTTP + DynamoDB + Cognito · S3 + CloudFront · AWS SAM.
> **Cost:** sits inside the free tier for personal use (~$0/mo).

---

## Repo layout

```
codetype-solo/
├── shared/   # @codetype/shared — pure-TS WPM + streak (TDD'd)
├── web/      # @codetype/web    — Next.js static export
├── api/      # @codetype/api    — Lambda handlers (bun build → dist/)
├── infra/    # @codetype/infra  — SAM template + deploy/seed scripts
└── data/snippets/  # raw snippet JSON per language
```

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3 (`curl -fsSL https://bun.sh/install | bash`)
- AWS CLI configured with profile `jgyy` in region `ap-southeast-1`
- AWS SAM CLI (`pipx install aws-sam-cli` or your distro's package)

## Local development

```bash
bun install
bun test                          # 28 tests across shared/ + api/
bun --filter @codetype/web dev    # http://localhost:3000 (guest mode, no AWS needed)
```

Without `web/.env.local`, the web app runs in **guest mode**: attempts persist to `localStorage`. Sign-in is hidden until Cognito is configured.

## Deploy to AWS (one command)

```bash
bun run deploy:guided    # first time only — interactive SAM bootstrap
bun run deploy           # subsequent: build api → SAM → seed → build web → S3 sync → CF invalidate
```

After the first deploy, populate `web/.env.local` from stack outputs:

```bash
bun run outputs          # prints ApiUrl, UserPoolId, UserPoolClientId, CloudFrontUrl, …
```

```ini
# web/.env.local
NEXT_PUBLIC_API_URL=https://<id>.execute-api.ap-southeast-1.amazonaws.com
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-southeast-1_xxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxx
NEXT_PUBLIC_COGNITO_REGION=ap-southeast-1
```

Then redeploy the web layer only:

```bash
bun run deploy:web
```

## Scripts

| Command | What it does |
|---|---|
| `bun test` | All unit + handler tests (`shared/` + `api/`) |
| `bun run deploy` | Full deploy: API build → SAM → seed → web build → S3 sync → invalidate |
| `bun run deploy:stack` | SAM only (Lambda + API + DynamoDB + Cognito + S3/CF) |
| `bun run deploy:web` | Build + sync `web/out` to S3 + invalidate CloudFront |
| `bun run seed` | Seed snippets and 30-day daily-challenge pool into DynamoDB |
| `bun run outputs` | Print CloudFormation outputs for the current stack |

## Architecture

```
                        ┌────────────┐
        users ─────►    │ CloudFront │ ─► S3 (Next.js static export)
                        └────┬───────┘
                             │ JSON over HTTPS (Bearer JWT)
                             ▼
                       ┌────────────┐         ┌──────────────┐
                       │ HTTP API   │ ──────► │ Lambda × 5   │
                       │ (JWT auth) │         │ (Bun bundles)│
                       └────────────┘         └──────┬───────┘
                                                     │
                                              ┌──────┴───────┐
                                              │ DynamoDB     │
                                              │ single-table │
                                              └──────────────┘
                       Cognito User Pool (free tier, 50k MAU)
```

- **Auth boundary is the partition key.** `sub` from the JWT is used as `PK = USER#<sub>` for all per-user reads/writes — a forged request can't address another user's items.
- **Idempotent writes.** Every `PutItem` uses a `ConditionExpression` so retries no-op safely.
- **Server recomputes WPM** on every attempt; client-supplied numbers only set a `wpm_mismatch` flag.
- **Daily challenge** is a deterministic FNV-1a hash of the date string, with a self-seeding read path guarded by `attribute_not_exists(SK)` to make racing cold Lambdas safe.

## Testing

```bash
bun test
# 28 pass · 0 fail
# - shared/tests/wpm.test.ts        (8 cases, plan §4)
# - shared/tests/streak.test.ts     (9 cases, plan §4)
# - api/tests/handlers/*.test.ts    (11 cases, mocked DynamoDB)
```

## License

MIT — see [LICENSE](./LICENSE).
