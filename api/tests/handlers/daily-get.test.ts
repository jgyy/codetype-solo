import { describe, expect, test } from "bun:test";
import { DailyQuery } from "@codetype/shared";
import {
    compose,
    withAuth,
    withErrorEnvelope,
    withLogger,
    withRepos,
    withRequestId,
    withSchema,
} from "../../src/middleware";
import { getDailyLogic } from "../../src/handlers/daily-get";
import { composeInMemoryRepos, type SnippetRow } from "../../src/repos";

const seedSnippets: SnippetRow[] = [
    { PK: "SNIPPET#js", SK: "SNIPPET#js-001", entity: "SNIPPET", language: "js", title: "T1", code: "x;", difficulty: 1 },
    { PK: "SNIPPET#py", SK: "SNIPPET#py-001", entity: "SNIPPET", language: "py", title: "T2", code: "y", difficulty: 2 },
];

const evt = (date?: string) =>
    ({
        requestContext: { http: { method: "GET" } },
        headers: {},
        queryStringParameters: date ? { date } : {},
    }) as never;

const makeHandler = (snippets = seedSnippets) => {
    const repos = composeInMemoryRepos(snippets);
    return compose(
        withRequestId(),
        withLogger(),
        withErrorEnvelope(),
        withRepos(repos),
        withAuth({ required: false }),
        withSchema(DailyQuery, "query"),
    )(getDailyLogic, { successStatus: 200 });
};

describe("GET /daily (composed)", () => {
    test("self-seeds on first call, returns same row on second", async () => {
        const handler = makeHandler();
        const r1 = (await handler(evt("2026-05-06"))) as { statusCode: number; body: string };
        expect(r1.statusCode).toBe(200);
        const d1 = JSON.parse(r1.body).data;
        expect(d1.SK).toBe("DATE#2026-05-06");
        const r2 = (await handler(evt("2026-05-06"))) as { statusCode: number; body: string };
        expect(JSON.parse(r2.body).data).toEqual(d1);
    });

    test("rejects malformed date", async () => {
        const r = (await makeHandler()(evt("not-a-date"))) as { statusCode: number };
        expect(r.statusCode).toBe(400);
    });

    test("400 when no snippets are seeded", async () => {
        const r = (await makeHandler([])(evt("2026-05-06"))) as { statusCode: number };
        expect(r.statusCode).toBe(400);
    });
});
