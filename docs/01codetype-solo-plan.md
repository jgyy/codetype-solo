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
- **Backend:** AWS Lambda (Node.js) behind API Gateway HTTP API
- **Database:** DynamoDB (on-demand billing — pay-per-request, no idle cost)
- **Auth:** Amazon Cognito User Pool (free tier: 50k MAUs) — guest mode also works
- **Charts:** Recharts (stats over time)
- **Hosting:** S3 (static site) + CloudFront (CDN + HTTPS)
- **IaC:** AWS SAM or plain CloudFormation (single stack)
- **Package manager / runtime:** Bun (install, scripts, test runner)
- **AWS profile:** `jgyy` (all `aws` / `sam` / `cdk` commands use `--profile jgyy`)
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

One table `codetype` with composite key `(PK, SK)`:

| Entity | PK | SK | Attributes |
|---|---|---|---|
| Profile | `USER#<sub>` | `PROFILE` | email, created_at |
| Attempt | `USER#<sub>` | `ATTEMPT#<iso_ts>` | snippet_id, wpm_gross, wpm_net, wpm_scaled, accuracy, errors, duration_ms, language |
| Snippet | `SNIPPET#<lang>` | `SNIPPET#<id>` | title, code, difficulty |
| Daily seed | `DAILY` | `DATE#<yyyy-mm-dd>` | snippet_id |

**GSI1** (`GSI1PK = USER#<sub>`, `GSI1SK = DATE#<yyyy-mm-dd>`) for streak/history queries by date range.

Authorisation: Lambda extracts `sub` from the Cognito JWT (validated by API Gateway JWT authorizer) and uses it as the partition key — users physically cannot read another user's items because their PK isn't in the query.

---

## Folder structure (matches B1 spec)

```
codetype-solo/
├── README.md
├── LICENSE
├── .gitignore
├── package.json
├── src/
│   ├── app/                # Next.js App Router pages (static export)
│   ├── components/         # UI components (shadcn + custom)
│   └── lib/                # api client, cognito helper, dynamo helpers
├── lambda/                 # Lambda handlers (one per route)
│   ├── attempts-post.ts
│   ├── attempts-list.ts
│   └── daily-get.ts
├── infra/
│   └── template.yaml       # AWS SAM template (S3+CF+APIGW+Lambda+Dynamo+Cognito)
├── tests/                  # vitest unit + playwright e2e (smoke only)
├── docs/
│   ├── ai-log.md           # prompt log + decision log (B1 deliverable)
│   └── architecture.md
├── scripts/
│   └── seed-snippets.ts    # batch-write snippets into DynamoDB
├── assets/                 # screenshots, demo gif
└── data/
    └── snippets/           # raw .json files per language
```

---

## Build sequence (4 days)

| Day | Goal | Deliverable |
|---|---|---|
| 1 | Scaffold Next.js + typing engine (guest mode, localStorage) | Can complete a snippet locally; WPM/accuracy correct |
| 2 | SAM template: Dynamo + Lambda + API Gateway + Cognito | `sam deploy` succeeds; can POST/GET attempts via curl with JWT |
| 3 | Wire frontend to API; history + daily + streaks | Full game loop persisted in DynamoDB |
| 4 | S3 + CloudFront deploy, dashboard chart, README, demo gif | Shippable demo on a CloudFront URL |

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
