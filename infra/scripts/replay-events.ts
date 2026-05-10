#!/usr/bin/env bun
//
// Backfill harness for the spec 011 event pipeline.
//
//   bun run scripts/replay-events.ts \
//     --sub <cognito-sub> \
//     --from 2026-01-01 --to 2026-05-01 \
//     --projector leaderboard
//
// Reads the user's ATTEMPT items via AttemptsRepo.listByUser and feeds
// synthesised AttemptRecorded events to the named projector. Idempotent by
// construction — projectors use conditional writes.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { projectors } from "../../api/src/events";
import type { AttemptRecorded } from "../../api/src/events/types";
import { makeDdbAttemptsRepo } from "../../api/src/repos/attempts";
import { makeDdbLeaderboardRepo } from "../../api/src/repos/leaderboard";
import { makeDdbProfileRepo } from "../../api/src/repos/profile";
import { makeDdbSnippetsRepo } from "../../api/src/repos/snippets";
import { makeDdbDailyRepo } from "../../api/src/repos/daily";
import { makeDdbSubmissionsRepo } from "../../api/src/repos/submissions";
import type { Repos } from "../../api/src/repos";
import { makeLogger } from "../../api/src/lib/logger";
import { resolveTableName } from "./_stack";

type Args = {
    sub: string;
    from: string;
    to: string;
    projector: string;
};

function parseArgs(argv: string[]): Args {
    const out: Partial<Args> = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]!;
        const v = argv[i + 1];
        if (a === "--sub" && v) { out.sub = v; i++; }
        else if (a === "--from" && v) { out.from = v; i++; }
        else if (a === "--to" && v) { out.to = v; i++; }
        else if (a === "--projector" && v) { out.projector = v; i++; }
    }
    if (!out.sub || !out.from || !out.to || !out.projector) {
        console.error("usage: replay-events --sub <sub> --from YYYY-MM-DD --to YYYY-MM-DD --projector <name>");
        process.exit(2);
    }
    return out as Args;
}

function buildRepos(client: DynamoDBDocumentClient, table: string): Repos {
    const snippets = makeDdbSnippetsRepo(client, table);
    return {
        attempts: makeDdbAttemptsRepo(client, table),
        snippets,
        daily: makeDdbDailyRepo(client, table, snippets),
        profiles: makeDdbProfileRepo(client, table),
        leaderboard: makeDdbLeaderboardRepo(client, table),
        submissions: makeDdbSubmissionsRepo(client, table),
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const region = process.env.AWS_REGION ?? "ap-southeast-1";
    const table = resolveTableName();
    const endpoint = process.env.DDB_ENDPOINT;
    const ddb = DynamoDBDocumentClient.from(
        new DynamoDBClient({ region, ...(endpoint ? { endpoint } : {}) }),
    );
    const repos = buildRepos(ddb, table);
    const log = makeLogger({ requestId: `replay-${Date.now()}`, route: "REPLAY" });

    const target = projectors.find((p) => p.name === args.projector);
    if (!target) {
        const names = projectors.map((p) => p.name).join(", ");
        console.error(`unknown projector: ${args.projector} (known: ${names})`);
        process.exit(2);
    }
    if (!target.handles.includes("AttemptRecorded")) {
        console.error(`projector ${args.projector} does not handle AttemptRecorded; nothing to replay`);
        process.exit(2);
    }

    const list = await repos.attempts.listByUser(args.sub, { from: args.from, to: args.to });
    if (!list.ok) {
        console.error("listByUser failed", list.error);
        process.exit(1);
    }

    let dispatched = 0;
    let succeeded = 0;
    let failed = 0;
    for (const row of list.value) {
        if (typeof row.language !== "string") continue;
        const ev: AttemptRecorded = {
            type: "AttemptRecorded",
            sub: args.sub,
            language: row.language as AttemptRecorded["language"],
            image: row,
        };
        dispatched++;
        try {
            const r = await target.handle(ev, { repos, log });
            if (r.ok) succeeded++;
            else { failed++; log.warn("replay_failed", { error: r.error }); }
        } catch (e) {
            failed++;
            log.error("replay_threw", e);
        }
    }

    console.log(JSON.stringify({
        projector: args.projector,
        sub: args.sub,
        from: args.from,
        to: args.to,
        dispatched, succeeded, failed,
    }, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
