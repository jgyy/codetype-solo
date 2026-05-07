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

const evt = (sub = "u-1", email = "e@x") =>
    ({
        requestContext: {
            authorizer: { jwt: { claims: { sub, email } } },
            http: { method: "POST" },
        },
        headers: {},
        body: "{}",
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
});
