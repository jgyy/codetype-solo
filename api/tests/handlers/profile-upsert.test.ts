import { describe, expect, test } from "bun:test";
import { UpsertProfileBody } from "@codetype/shared";
import {
    compose,
    withAuth,
    withErrorEnvelope,
    withLogger,
    withRepos,
    withRequestId,
    withSchema,
} from "../../src/middleware";
import { upsertProfileLogic } from "../../src/handlers/profile-upsert";
import { composeInMemoryRepos } from "../../src/repos";

const evt = (body: unknown = {}, sub = "u-1", email = "e@x") =>
    ({
        requestContext: {
            authorizer: { jwt: { claims: { sub, email } } },
            http: { method: "POST" },
        },
        headers: {},
        body: typeof body === "string" ? body : JSON.stringify(body),
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
            withSchema(UpsertProfileBody),
        )(upsertProfileLogic, { successStatus: (v) => (v.created ? 201 : 200) }),
    };
};

describe("POST /profile (composed)", () => {
    test("creates on first call (201) and returns existing (200) on second", async () => {
        const { handler } = makeHandler();
        const r1 = (await handler(evt())) as { statusCode: number; body: string };
        expect(r1.statusCode).toBe(201);
        expect(JSON.parse(r1.body)).toMatchObject({ ok: true, data: { created: true } });

        const r2 = (await handler(evt())) as { statusCode: number; body: string };
        expect(r2.statusCode).toBe(200);
        expect(JSON.parse(r2.body)).toMatchObject({ ok: true, data: { created: false } });
    });

    test("accepts handle + leaderboard_optin patch and persists them", async () => {
        const { handler, repos } = makeHandler();
        await handler(evt());
        const r = (await handler(
            evt({ handle: "kestrel", leaderboard_optin: true }),
        )) as { statusCode: number; body: string };
        expect(r.statusCode).toBe(200);
        const data = JSON.parse(r.body).data;
        expect(data).toMatchObject({ handle: "kestrel", leaderboard_optin: true });
        const cur = await repos.profiles.get("u-1");
        if (!cur.ok || !cur.value) throw new Error();
        expect(cur.value.handle).toBe("kestrel");
        expect(cur.value.leaderboard_optin).toBe(true);
        expect(cur.value.handle_changed_at).toBeDefined();
    });

    test("rejects blocked handle", async () => {
        const { handler } = makeHandler();
        await handler(evt());
        const r = (await handler(evt({ handle: "admin" }))) as { statusCode: number };
        expect(r.statusCode).toBe(400);
    });

    test("rate-limits handle change to once per 24h", async () => {
        const { handler } = makeHandler();
        await handler(evt());
        const r1 = (await handler(evt({ handle: "kestrel" }))) as { statusCode: number };
        expect(r1.statusCode).toBe(200);
        const r2 = (await handler(evt({ handle: "falcon" }))) as { statusCode: number; body: string };
        expect(r2.statusCode).toBe(429);
        expect(JSON.parse(r2.body).error.code).toBe("rate_limited");
    });

    test("setting the same handle is not rate-limited (no-op change)", async () => {
        const { handler } = makeHandler();
        await handler(evt());
        await handler(evt({ handle: "kestrel" }));
        const r = (await handler(evt({ handle: "kestrel" }))) as { statusCode: number };
        expect(r.statusCode).toBe(200);
    });
});
