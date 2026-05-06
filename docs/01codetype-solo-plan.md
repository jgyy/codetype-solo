# CodeType Solo — Project Plan (P1: Individual Use)

**Programme:** B1 Builders — Project 1 of 2
**Submission deadline:** 15 May 2026
**Target build window:** ~3–4 days

---

## Concept

A daily code-snippet typing trainer for a single developer. User picks a language, types real code snippets against the clock, gets WPM/accuracy/error stats, and tracks streaks and progress over time.

**Why it qualifies as "individual use":** state is per-user (stats, streaks, settings). No shared resources. No multiplayer.

**Why it's a real personal tool, not a toy:** developers who type slowly waste real hours. Practising on actual code (not lorem ipsum) builds muscle memory for the symbols devs actually hit (`{`, `=>`, `::`, etc.).

---

## Stack

- **Frontend:** Next.js 16 (static export) + TypeScript + Tailwind + shadcn/ui
- **Backend:** AWS Lambda (Bun-compatible Node.js 22 runtime) behind API Gateway HTTP API
- **Database:** DynamoDB (on-demand billing — pay-per-request, no idle cost)
- **Auth:** Amazon Cognito User Pool (free tier: 50k MAUs) — guest mode also works
- **Charts:** Recharts (stats over time)
- **Hosting:** S3 (static site) + CloudFront (CDN + HTTPS)
- **IaC:** AWS SAM (single stack, `infra/template.yaml`)
- **Package manager / runtime:** **Bun everywhere** — `bun install`, `bun run`, `bun test`, `bun build` for Lambda bundling. No `npm` / `pnpm` / `yarn` anywhere in the repo. Lockfile is `bun.lock` (text format) committed at repo root.
- **Workspace layout:** **Bun workspaces** with multiple sibling `package.json` files (one per workspace). Root `package.json` declares `"workspaces": ["web", "api", "infra", "shared"]`; each workspace owns its own deps so Lambda bundles don't pull in Next.js and vice versa.
- **AWS profile:** `jgyy` (all `aws` / `sam` commands use `--profile jgyy`)
- **AI tool:** opencode

### Why this is the cheapest viable AWS stack

| Component | Cost at demo scale | Notes |
|---|---|---|
| S3 static hosting | ~$0.02/mo | A few MB of assets |
| CloudFront | Free tier 1 TB/mo egress for 12 mo, then ~$0.085/GB | Negligible for personal demo |
| API Gateway HTTP API | $1.00 per million requests | HTTP API, *not* REST API (REST is 3.5×) |
| Lambda | Free tier: 1M requests + 400k GB-s/mo forever | Stays free for personal use |
| DynamoDB on-demand | $1.25 per million writes, $0.25 per million reads | No provisioned throughput → no idle cost |
| Cognito | Free up to 50k MAU | Effectively free |
| **Total expected** | **< $1/month** for personal use | Most months: $0 within free tier |

Avoid: RDS (≥$13/mo for smallest db.t4g.micro), Amplify Hosting (fine but pricier than S3+CF), ECS/Fargate (always-on cost), API Gateway REST (3.5× HTTP API cost).

---

## Core features (must-have for submission)

1. **Snippet runner** — fetch a snippet, type it, live diff highlighting (correct char = green, wrong = red).
2. **Per-attempt stats** — WPM (all three formulas: Gross, Net, Accuracy-scaled), accuracy %, time, error count, per-character timing. Result UI shows all three WPM numbers side-by-side so the user can see speed vs. error-adjusted speed.
3. **Daily challenge** — same snippet for all users on a given UTC date (seeded by date).
4. **Personal history** — list of past attempts with sortable columns.
5. **Streak counter** — consecutive days with at least one completed attempt.
6. **Stats dashboard** — line chart of WPM over time, accuracy distribution, weakest characters.
7. **Language picker** — JavaScript, Python, C, Go (start with 4; ~30 snippets each).

## Stretch (only if ahead of schedule)

- Spaced-repetition queue for snippets the user typed slowly.
- Custom snippet upload (paste your own code).
- Keyboard heatmap showing finger-to-key error rate.

---

## Data model (DynamoDB — single-table design)

Single on-demand table **`codetype`**, composite key `(PK, SK)`. One GSI for date-range history.

### Table schema

| AttributeName | Type | Role |
|---|---|---|
| `PK` | S | partition key |
| `SK` | S | sort key |
| `GSI1PK` | S | GSI1 partition key |
| `GSI1SK` | S | GSI1 sort key |

**GSI1**: `GSI1PK` (HASH) + `GSI1SK` (RANGE), `ProjectionType: ALL`.
**Billing:** `PAY_PER_REQUEST`.
**TTL:** not enabled (history is the product).
**Stream:** disabled (no consumers).

### Item shapes (every field every writer sets)

| Entity | `PK` | `SK` | `GSI1PK` | `GSI1SK` | Other attributes |
|---|---|---|---|---|---|
| **Profile** | `USER#<sub>` | `PROFILE` | — | — | `email` (S), `created_at` (S, ISO-8601), `entity` = `"PROFILE"` |
| **Attempt** | `USER#<sub>` | `ATTEMPT#<iso_ts>#<nanoid6>` | `USER#<sub>` | `DATE#<yyyy-mm-dd>#<iso_ts>` | `snippet_id` (S), `language` (S), `wpm_gross` (N), `wpm_net` (N), `wpm_scaled` (N), `accuracy` (N, 0–1), `errors` (N), `duration_ms` (N), `chars_total` (N), `chars_correct` (N), `created_at` (S), `entity` = `"ATTEMPT"` |
| **Snippet** | `SNIPPET#<lang>` | `SNIPPET#<id>` | — | — | `title` (S), `code` (S, ≤400 chars), `difficulty` (N, 1–5), `language` (S), `entity` = `"SNIPPET"` |
| **DailySeed** | `DAILY` | `DATE#<yyyy-mm-dd>` | — | — | `snippet_id` (S), `language` (S), `entity` = `"DAILY"` |

> Note on the Attempt SK: `ATTEMPT#<iso_ts>#<nanoid6>` includes a 6-char suffix so two attempts in the same millisecond don't collide. The GSI1SK keeps `DATE#<yyyy-mm-dd>#<iso_ts>` so a `Query` with `GSI1SK BETWEEN DATE#A AND DATE#B` returns history for any date range, sorted.

### Write paths — every DynamoDB mutation in the system

All writes go through `api/src/lib/dynamo.ts` which wraps `DynamoDBDocumentClient`. Every handler that writes uses a **`ConditionExpression`** to make the operation safe to retry.

#### 1. `POST /attempts` → `attempts-post.ts`

Triggered when the user finishes typing a snippet. Writes one Attempt item.

- **Op:** `PutItem`
- **Idempotency:** client sends a `client_attempt_id` (uuid). Handler appends it as the nanoid suffix in the SK. `ConditionExpression: attribute_not_exists(PK) AND attribute_not_exists(SK)` — retries with the same `client_attempt_id` no-op cleanly.
- **Validation before write:** `wpm_*` ≥ 0, `accuracy` in [0, 1], `duration_ms` > 0, `chars_total` > 0, `language ∈ {js, py, c, go}`, `snippet_id` exists (cached lookup). Reject with 400 otherwise — never write garbage.
- **WPM computed server-side too** from `chars_total / chars_correct / errors / duration_ms` using `@codetype/shared` and compared to client values; if they differ by >1 WPM the server values win and a `wpm_mismatch: true` flag is added (don't fail the write — the user already finished typing).

#### 2. `POST /profile` → `profile-upsert.ts`

Called once on first sign-in (and idempotent on every sign-in).

- **Op:** `PutItem` with `ConditionExpression: attribute_not_exists(PK)` — first call inserts, subsequent calls fail with `ConditionalCheckFailedException` which the handler swallows and returns 200.
- Sets `email`, `created_at = now()`, `entity = "PROFILE"`.

#### 3. `GET /daily?date=YYYY-MM-DD` → `daily-get.ts` (read-or-seed)

The daily challenge is deterministic per UTC date. If `seed-daily.ts` hasn't run for the requested date, this handler self-seeds.

- **Op A (read):** `GetItem PK=DAILY, SK=DATE#<date>`. If found, return.
- **Op B (seed if missing):** pick a snippet by hashing the date string → index into snippet list (deterministic; same result if two cold Lambdas race). Then `PutItem` with `ConditionExpression: attribute_not_exists(SK)` — if a parallel request beat us, our write fails harmlessly and we re-`GetItem`.
- **Never overwrites** an existing daily seed. The condition guarantees that.

#### 4. `scripts/seed-snippets.ts` (one-shot bulk load — `bun run`)

Reads `data/snippets/*.json`, writes every Snippet item into the table. Run once after `sam deploy`, and again whenever new snippets are added.

- **Op:** `BatchWriteItem` in chunks of 25 (DynamoDB's hard limit), with exponential-backoff retry on `UnprocessedItems`.
- **Idempotency:** `PutItem` overwrites by default; we *want* this so editing a snippet's `code` and re-running picks up the change. Snippet IDs are stable (filename slug + index), so re-runs don't create duplicates.
- **Length guard:** any snippet with `code.length > 400` is skipped with a warning — keeps the typing engine snappy (matches the Risks table cap).

#### 5. `scripts/seed-daily.ts` (rolling 30-day pre-seed — `bun run`)

Optional but nice: avoids the read-or-seed race in `daily-get.ts` for the next month.

- **Op:** `BatchWriteItem` of 30 DailySeed items, one per UTC date starting today.
- **Idempotency:** uses `BatchWriteItem` `PutRequest` (overwrites). Safe to re-run; latest snippet pool wins.
- Run as part of `bun run --filter @codetype/infra deploy`.

### Read paths (for completeness — these are not writes, but they're what the writes have to satisfy)

| Endpoint | Op | Key |
|---|---|---|
| `GET /attempts?from=&to=` | `Query` GSI1 | `GSI1PK = USER#<sub> AND GSI1SK BETWEEN DATE#<from> AND DATE#<to>~` |
| Streak calc | `Query` GSI1 last 60 days | feeds `shared/streak.ts` pure fn |
| `GET /snippets/{lang}/{id}` | `GetItem` | `PK=SNIPPET#<lang>, SK=SNIPPET#<id>` |

### Authorisation model

Lambda extracts `sub` from the Cognito JWT (validated by API Gateway's built-in JWT authorizer) and **uses it as the partition key for every per-user write and read**. The handler never accepts `userId` from the request body or query string. This means a malicious request can't address another user's items — their `sub` simply isn't the PK in the query. No row-level security rules to maintain; the key design *is* the security boundary.

Guest mode (no JWT) skips DynamoDB entirely and writes Attempts to `localStorage` via `web/src/lib/guest-store.ts`. Guest history never leaves the browser.

---

## Folder structure (Bun workspaces — multiple sibling `package.json`)

The repo is a **Bun workspace monorepo**. Each sibling directory under the root has its own `package.json` with workspace-scoped deps. `shared/` is consumed via the workspace protocol (`"@codetype/shared": "workspace:*"`) by both `web/` and `api/` so the WPM module and snippet types are written exactly once.

```
codetype-solo/
├── README.md
├── LICENSE
├── .gitignore
├── bun.lock                       # single lockfile for the whole workspace
├── package.json                   # ROOT — { "workspaces": ["web","api","infra","shared"] }, dev-only deps (typescript, @types/node)
│
├── shared/                        # ── workspace: @codetype/shared ──
│   ├── package.json               #   pure TS, no runtime deps; built with `bun build` to dist/
│   ├── src/
│   │   ├── wpm.ts                 #   grossWpm / netWpm / accuracyScaledWpm  (TDD'd first)
│   │   ├── types.ts               #   Snippet, Attempt, DailySeed item shapes
│   │   └── index.ts
│   └── tests/
│       └── wpm.test.ts            #   `bun test`
│
├── web/                           # ── workspace: @codetype/web ──
│   ├── package.json               #   next, react, react-dom, tailwindcss, shadcn deps, recharts
│   ├── next.config.ts             #   output: 'export'
│   ├── tsconfig.json
│   ├── src/
│   │   ├── app/                   #   App Router pages (static export)
│   │   │   ├── page.tsx           #   home / language picker
│   │   │   ├── play/page.tsx      #   typing engine
│   │   │   ├── history/page.tsx
│   │   │   └── dashboard/page.tsx
│   │   ├── components/            #   shadcn + custom (TypingArea, ResultCard, WpmChart)
│   │   └── lib/
│   │       ├── api.ts             #   fetch wrappers, attaches Cognito JWT
│   │       ├── auth.ts            #   amazon-cognito-identity-js helper
│   │       └── guest-store.ts     #   localStorage fallback when not signed in
│   └── tests/
│       └── e2e/                   #   playwright smoke (one happy path)
│
├── api/                           # ── workspace: @codetype/api ──
│   ├── package.json               #   @aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb, aws-jwt-verify
│   ├── tsconfig.json
│   ├── src/
│   │   ├── handlers/
│   │   │   ├── attempts-post.ts   #   POST /attempts             — write Attempt
│   │   │   ├── attempts-list.ts   #   GET  /attempts?from&to     — query GSI1
│   │   │   ├── daily-get.ts       #   GET  /daily?date=YYYY-MM-DD — read or seed DailySeed
│   │   │   ├── snippet-get.ts     #   GET  /snippets/{lang}/{id}
│   │   │   └── profile-upsert.ts  #   POST /profile              — first-login hook
│   │   ├── lib/
│   │   │   ├── dynamo.ts          #   DocumentClient singleton
│   │   │   ├── auth.ts            #   verifies JWT, extracts `sub`
│   │   │   └── streak.ts          #   pure fn: array<date> → streak count
│   │   └── build.ts               #   `bun build --target=node --outdir=dist` per handler
│   └── tests/
│       └── handlers/              #   `bun test` with mocked DynamoDB client
│
├── infra/                         # ── workspace: @codetype/infra ──
│   ├── package.json               #   scripts only: deploy, seed, sync-web, invalidate
│   ├── template.yaml              #   AWS SAM (Cognito + APIGW HTTP API + Lambda + DDB + S3 + CF)
│   ├── samconfig.toml
│   └── scripts/
│       ├── seed-snippets.ts       #   BatchWriteItem all snippets into DynamoDB (idempotent)
│       ├── seed-daily.ts          #   pick one snippet per UTC date for the next 30 days
│       ├── sync-web.ts            #   `bun run` → s3 sync web/out/ s3://bucket/
│       └── invalidate.ts          #   CloudFront invalidation for /index.html and /_next/*
│
├── docs/
│   ├── 01codetype-solo-plan.md    # this file
│   ├── ai-log.md                  # prompt log + decision log (B1 deliverable)
│   └── architecture.md
│
├── data/
│   └── snippets/                  # raw .json files per language (js / py / c / go)
│
└── assets/                        # screenshots, demo gif
```

### Why this layout

- **No dep leakage.** `api/` Lambda bundles never pull in `next` / `react` / `tailwindcss`. `web/` never pulls in `@aws-sdk/*`. Bundle size stays small → cold starts stay fast.
- **One source of truth for WPM and item shapes.** `shared/` is consumed via `"@codetype/shared": "workspace:*"` so a change to the `Attempt` shape breaks both sides at typecheck time.
- **Per-workspace `bun test`.** Run `bun test` at root to test everything, or `cd shared && bun test` to iterate on the WPM module in isolation.
- **Per-workspace scripts.** `bun run --filter @codetype/web dev`, `bun run --filter @codetype/api build`, `bun run --filter @codetype/infra deploy`.

---

## Build sequence (4 days)

| Day | Goal | Deliverable |
|---|---|---|
| 1 | Init Bun workspace (`bun init` + workspaces in root `package.json`); TDD `shared/wpm.ts`; scaffold `web/` with `bun create next-app` + Tailwind + shadcn; build typing engine in guest mode (localStorage) | `bun test` green for WPM; can complete a snippet locally and see all three WPM numbers |
| 2 | Build `api/` workspace handlers with mocked DynamoDB tests; author `infra/template.yaml` (DDB + Lambda + APIGW HTTP API + Cognito); `bun run --filter @codetype/infra deploy` | `sam deploy` succeeds; `bun run --filter @codetype/infra seed` populates snippets; curl + JWT round-trips POST/GET `/attempts` |
| 3 | Wire `web/` to API via `web/src/lib/api.ts`; implement history + daily + streaks; flip guest-mode flag off when signed in | Full game loop persisted to DynamoDB; streak counter increments correctly across UTC date boundaries |
| 4 | Add S3 + CloudFront to SAM template; `bun run --filter @codetype/web build` → `sync-web.ts` → `invalidate.ts`; dashboard WPM chart; README + demo gif | Shippable demo on a CloudFront URL; one-command deploy: `bun run deploy` from repo root |

---

## AI workflow plan (for `docs/ai-log.md`)

I'll log, per session:

- **Prompts that worked** — kept as-is in final code.
- **Prompts that failed** — what the AI got wrong and the human-side correction.
- **Review decisions** — moments I rejected AI output and why (e.g., AI suggested storing per-keystroke timing in localStorage; rejected because it doesn't sync across devices; moved to Postgres jsonb column).
- **Tools used:** opencode for code gen + refactor; manually verified all DB schema and security rules.

This directly answers the README rubric (lines 117–119 of the programme doc): "List of key prompts used" and "List of key review points and the corresponding decision made."

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Typing engine perf janky on long snippets | Cap snippets at 400 chars; use uncontrolled input + ref |
| Stats computation off-by-one (common in WPM) | Write unit tests for WPM calc *first* (TDD on this module only). Module exports `grossWpm`, `netWpm`, `accuracyScaledWpm` — all three are stored on each attempt so we can change the "headline" number later without re-computing history. |
| Cognito + JWT authorizer eats half a day | Guest-mode fallback with localStorage so demo works without auth; wire Cognito on Day 3 only if Day 2 finishes early |
| AWS bill surprise | DynamoDB on-demand + Lambda + HTTP API are all pay-per-request; set a $5 AWS Budgets alert; never use RDS or provisioned capacity |
| CloudFront cache makes JS updates invisible | Use versioned filenames (Next.js does this) + invalidate `/index.html` on deploy |
| Scope creep on charts | One chart only (WPM over time); skip the rest unless Day 4 is free |

---

## Demo storyline (for interview)

1. Land on home → click "Start daily challenge."
2. Type the snippet → see live red/green feedback → finish.
3. Result screen: WPM 64, accuracy 96%, streak now 3 days.
4. Open History → sortable table.
5. Open Dashboard → chart showing improvement over a week.
6. Switch language → start a fresh attempt.

Total demo time: ~2 minutes. Aim for a 30-second GIF in the README.
