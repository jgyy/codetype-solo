import { describe, expect, test } from "bun:test";
import { PostAttemptBody } from "@codetype/shared";
import {
    compose,
    withAuth,
    withErrorEnvelope,
    withLogger,
    withRepos,
    withRequestId,
    withSchema,
} from "../../src/middleware";
import { postAttemptLogic } from "../../src/handlers/attempts-post";
import { composeInMemoryRepos } from "../../src/repos";

const baseEvent = (body: unknown, sub = "user-1") =>
    ({
        requestContext: {
            authorizer: { jwt: { claims: { sub, email: "e@x" } } },
            http: { method: "POST" },
            requestId: "r-1",
        },
        headers: {},
        body: JSON.stringify(body),
    }) as never;

const validBody = {
    client_attempt_id: "abc123def",
    snippet_id: "js-001",
    language: "js",
    wpm_gross: 12,
    wpm_net: 12,
    wpm_scaled: 12,
    accuracy: 1,
    errors: 0,
    duration_ms: 60_000,
    chars_total: 60,
    chars_correct: 60,
};

const makeHandler = () => {
    const repos = composeInMemoryRepos();
    const handler = compose(
        withRequestId(),
        withLogger(),
        withErrorEnvelope(),
        withRepos(repos),
        withAuth({ required: true }),
        withSchema(PostAttemptBody),
    )(postAttemptLogic, {
        successStatus: (v) => ("duplicate" in v && v.duplicate ? 200 : 201),
    });
    return { repos, handler };
};

describe("POST /attempts (composed)", () => {
    test("rejects missing JWT", async () => {
        const { handler } = makeHandler();
        const r = (await handler({
            requestContext: { http: { method: "POST" } },
            headers: {},
            body: "{}",
        } as never)) as { statusCode: number };
        expect(r.statusCode).toBe(401);
    });

    test("rejects bad language", async () => {
        const { handler } = makeHandler();
        const r = (await handler(baseEvent({ ...validBody, language: "rust" }))) as {
            statusCode: number;
        };
        expect(r.statusCode).toBe(400);
    });

    test("writes a valid attempt", async () => {
        const { handler, repos } = makeHandler();
        const r = (await handler(baseEvent(validBody))) as { statusCode: number; body: string };
        expect(r.statusCode).toBe(201);
        const data = JSON.parse(r.body).data;
        expect(data.sk).toMatch(/^ATTEMPT#/);
        const list = await repos.attempts.listByUser("user-1", { from: "1970-01-01", to: "9999-12-31" });
        if (!list.ok) throw new Error("listByUser failed");
        expect(list.value.length).toBe(1);
    });

    test("idempotent on duplicate (frozen clock)", async () => {
        const { handler, repos } = makeHandler();
        const fixedTime = "2026-05-07T10:00:00.000Z";
        const realDate = Date;
        // @ts-expect-error - test stub
        globalThis.Date = class extends realDate {
            constructor() { super(); return new realDate(fixedTime); }
            static now() { return new realDate(fixedTime).getTime(); }
        } as DateConstructor;
        try {
            const r1 = (await handler(baseEvent(validBody))) as { statusCode: number };
            expect(r1.statusCode).toBe(201);
            const r2 = (await handler(baseEvent(validBody))) as { statusCode: number; body: string };
            expect(r2.statusCode).toBe(200);
            expect(JSON.parse(r2.body)).toMatchObject({ ok: true, data: { duplicate: true } });
        } finally {
            globalThis.Date = realDate;
        }
        const list = await repos.attempts.listByUser("user-1", { from: "1970-01-01", to: "9999-12-31" });
        if (!list.ok) throw new Error("listByUser failed");
        expect(list.value.length).toBe(1);
    });

    test("server recomputes WPM (client-supplied wpm_gross is ignored for storage)", async () => {
        const { handler, repos } = makeHandler();
        const r = (await handler(baseEvent({ ...validBody, wpm_gross: 999 }))) as {
            statusCode: number;
            body: string;
        };
        expect(r.statusCode).toBe(201);
        expect(JSON.parse(r.body).data.wpm_mismatch).toBe(true);
        const list = await repos.attempts.listByUser("user-1", { from: "1970-01-01", to: "9999-12-31" });
        if (!list.ok) throw new Error("listByUser failed");
        expect(list.value[0]!.wpm_gross).toBe(12);
    });
});
