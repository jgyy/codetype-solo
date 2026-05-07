import { describe, expect, test } from "bun:test";
import { httpAdapter } from "../../src/lib/http";
import { getDailyLogic } from "../../src/handlers/daily-get";
import { composeInMemoryRepos } from "../../src/repos";
import type { SnippetRow } from "../../src/repos";

const seedSnippets: SnippetRow[] = [
    {
        PK: "SNIPPET#js",
        SK: "SNIPPET#js-001",
        entity: "SNIPPET",
        language: "js",
        title: "T1",
        code: "x;",
        difficulty: 1,
    },
    {
        PK: "SNIPPET#py",
        SK: "SNIPPET#py-001",
        entity: "SNIPPET",
        language: "py",
        title: "T2",
        code: "y",
        difficulty: 2,
    },
];

const evt = (date?: string) =>
    ({
        requestContext: { http: { method: "GET" } },
        queryStringParameters: date ? { date } : {},
    }) as never;

describe("GET /daily", () => {
    test("self-seeds on first call, returns same row on second call", async () => {
        const repos = composeInMemoryRepos(seedSnippets);
        const handler = httpAdapter(getDailyLogic, { successStatus: 200, repos });

        const r1 = (await handler(evt("2026-05-06"))) as { statusCode: number; body: string };
        expect(r1.statusCode).toBe(200);
        const d1 = JSON.parse(r1.body).data;
        expect(d1.PK).toBe("DAILY");
        expect(d1.SK).toBe("DATE#2026-05-06");

        const r2 = (await handler(evt("2026-05-06"))) as { statusCode: number; body: string };
        expect(r2.statusCode).toBe(200);
        expect(JSON.parse(r2.body).data).toEqual(d1);
    });

    test("rejects malformed date", async () => {
        const repos = composeInMemoryRepos(seedSnippets);
        const handler = httpAdapter(getDailyLogic, { successStatus: 200, repos });
        const r = (await handler(evt("not-a-date"))) as { statusCode: number };
        expect(r.statusCode).toBe(400);
    });

    test("400 when no snippets are seeded", async () => {
        const repos = composeInMemoryRepos([]);
        const handler = httpAdapter(getDailyLogic, { successStatus: 200, repos });
        const r = (await handler(evt("2026-05-06"))) as { statusCode: number };
        expect(r.statusCode).toBe(400);
    });
});
