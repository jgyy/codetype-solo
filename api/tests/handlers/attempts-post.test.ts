import { describe, expect, test } from "bun:test";
import { httpAdapter } from "../../src/lib/http";
import { postAttemptLogic } from "../../src/handlers/attempts-post";
import { composeInMemoryRepos } from "../../src/repos";

const baseEvent = (body: unknown, sub = "user-1") =>
    ({
        requestContext: {
            authorizer: { jwt: { claims: { sub, email: "e@x" } } },
            http: { method: "POST" },
            requestId: "r-1",
        },
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
    return {
        repos,
        handler: httpAdapter(postAttemptLogic, {
            successStatus: (v) => ("duplicate" in v && v.duplicate ? 200 : 201),
            repos,
        }),
    };
};

describe("POST /attempts", () => {
    test("rejects missing JWT", async () => {
        const { handler } = makeHandler();
        const r = await handler({ requestContext: { http: { method: "POST" } }, body: "{}" } as never);
        expect((r as { statusCode: number }).statusCode).toBe(401);
    });

    test("rejects bad language", async () => {
        const { handler } = makeHandler();
        const r = await handler(baseEvent({ ...validBody, language: "rust" }));
        expect((r as { statusCode: number }).statusCode).toBe(400);
    });

    test("writes a valid attempt and returns sk", async () => {
        const { handler, repos } = makeHandler();
        const r = (await handler(baseEvent(validBody))) as { statusCode: number; body: string };
        expect(r.statusCode).toBe(201);
        const data = JSON.parse(r.body).data;
        expect(data.sk).toMatch(/^ATTEMPT#/);
        expect(data.wpm_mismatch).toBe(false);
        const list = await repos.attempts.listByUser("user-1", { from: "1970-01-01", to: "9999-12-31" });
        if (!list.ok) throw new Error("listByUser failed");
        expect(list.value.length).toBe(1);
        expect(list.value[0]!.PK).toBe("USER#user-1");
    });

    test("idempotent on duplicate (same client_attempt_id same instant)", async () => {
        const { handler, repos } = makeHandler();
        // Pre-populate via the repo with the exact same key the handler will compute.
        // Instead, post twice quickly enough that timestamps may differ — guarantee a hit
        // by writing through the repo with a known createdAt then re-posting.
        const fixedTime = "2026-05-07T10:00:00.000Z";
        const realDate = Date;
        // @ts-expect-error - test stub
        globalThis.Date = class extends realDate {
            constructor() {
                super();
                return new realDate(fixedTime);
            }
            static now() {
                return new realDate(fixedTime).getTime();
            }
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

    test("flags wpm mismatch when client values diverge", async () => {
        const { handler, repos } = makeHandler();
        const r = (await handler(baseEvent({ ...validBody, wpm_gross: 999 }))) as {
            statusCode: number;
            body: string;
        };
        expect(r.statusCode).toBe(201);
        expect(JSON.parse(r.body).data.wpm_mismatch).toBe(true);
        const list = await repos.attempts.listByUser("user-1", { from: "1970-01-01", to: "9999-12-31" });
        if (!list.ok) throw new Error("listByUser failed");
        expect(list.value[0]!.wpm_gross).toBe(12); // server value, not 999
        expect(list.value[0]!.wpm_mismatch).toBe(true);
    });
});
