import { describe, expect, test } from "bun:test";
import { GetLeaderboardQuery } from "@codetype/shared";
import {
    compose,
    withAuth,
    withErrorEnvelope,
    withLogger,
    withRepos,
    withRequestId,
    withSchema,
} from "../../src/middleware";
import { getLeaderboardLogic } from "../../src/handlers/leaderboard-get";
import { composeInMemoryRepos } from "../../src/repos";

const evt = (qs: Record<string, string>) =>
    ({
        requestContext: { http: { method: "GET" } },
        headers: {},
        queryStringParameters: qs,
    }) as never;

const make = () => {
    const repos = composeInMemoryRepos();
    return {
        repos,
        handler: compose(
            withRequestId(),
            withLogger(),
            withErrorEnvelope(),
            withRepos(repos),
            withAuth({ required: false }),
            withSchema(GetLeaderboardQuery, "query"),
        )(getLeaderboardLogic, { successStatus: 200 }),
    };
};

describe("GET /leaderboard", () => {
    test("returns ranked entries (no auth required)", async () => {
        const { handler, repos } = make();
        await repos.leaderboard.upsert("js", "2026-W19", {
            sub: "a", handle: "alpha", wpm_scaled: 50, attempts_in_window: 3, updated_at: "t",
        });
        await repos.leaderboard.upsert("js", "2026-W19", {
            sub: "b", handle: "bravo", wpm_scaled: 90, attempts_in_window: 5, updated_at: "t",
        });
        const r = (await handler(evt({ lang: "js", week: "2026-W19" }))) as {
            statusCode: number; body: string;
        };
        expect(r.statusCode).toBe(200);
        const data = JSON.parse(r.body).data;
        expect(data.entries[0]).toMatchObject({ rank: 1, handle: "bravo", wpm_scaled: 90 });
        expect(data.entries[1]).toMatchObject({ rank: 2, handle: "alpha", wpm_scaled: 50 });
    });

    test("rejects unknown language", async () => {
        const { handler } = make();
        const r = (await handler(evt({ lang: "rust" }))) as { statusCode: number };
        expect(r.statusCode).toBe(400);
    });

    test("defaults week to current ISO week when omitted", async () => {
        const { handler } = make();
        const r = (await handler(evt({ lang: "js" }))) as { statusCode: number; body: string };
        expect(r.statusCode).toBe(200);
        expect(JSON.parse(r.body).data.week).toMatch(/^\d{4}-W\d{2}$/);
    });
});
