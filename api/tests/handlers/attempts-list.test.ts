import { describe, expect, test } from "bun:test";
import { ListAttemptsQuery } from "@codetype/shared";
import {
    compose,
    withAuth,
    withErrorEnvelope,
    withLogger,
    withRepos,
    withRequestId,
    withSchema,
} from "../../src/middleware";
import { listAttemptsLogic } from "../../src/handlers/attempts-list";
import { composeInMemoryRepos } from "../../src/repos";

const evt = (overrides: Record<string, unknown> = {}) =>
    ({
        requestContext: {
            authorizer: { jwt: { claims: { sub: "u-1" } } },
            http: { method: "GET" },
        },
        headers: {},
        ...overrides,
    }) as never;

const makeHandler = () => {
    const repos = composeInMemoryRepos();
    return {
        repos,
        handler: compose(
            withRequestId(),
            withLogger(),
            withErrorEnvelope(),
            withRepos(repos),
            withAuth({ required: true }),
            withSchema(ListAttemptsQuery, "query"),
        )(listAttemptsLogic, { successStatus: 200 }),
    };
};

describe("GET /attempts (composed)", () => {
    test("returns the user's attempts", async () => {
        const { handler, repos } = makeHandler();
        await repos.attempts.put({
            sub: "u-1",
            clientAttemptId: "id1",
            snippetId: "js-001",
            language: "js",
            createdAt: "2026-05-03T12:00:00.000Z",
            wpmGross: 50, wpmNet: 50, wpmScaled: 50,
            accuracy: 1, errors: 0, durationMs: 60_000,
            charsTotal: 250, charsCorrect: 250, wpmMismatch: false,
        });

        const r = (await handler(
            evt({ queryStringParameters: { from: "2026-05-01", to: "2026-05-06" } }),
        )) as { statusCode: number; body: string };
        expect(r.statusCode).toBe(200);
        expect(JSON.parse(r.body).data.items.length).toBe(1);
    });

    test("rejects malformed `from` query", async () => {
        const { handler } = makeHandler();
        const r = (await handler(
            evt({ queryStringParameters: { from: "01-01-2026" } }),
        )) as { statusCode: number };
        expect(r.statusCode).toBe(400);
    });

    test("rejects missing JWT", async () => {
        const { handler } = makeHandler();
        const r = (await handler({
            requestContext: { http: { method: "GET" } },
            headers: {},
        } as never)) as { statusCode: number };
        expect(r.statusCode).toBe(401);
    });
});
