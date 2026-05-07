import { describe, expect, test } from "bun:test";
import { httpAdapter } from "../../src/lib/http";
import { upsertProfileLogic } from "../../src/handlers/profile-upsert";
import { composeInMemoryRepos } from "../../src/repos";

const evt = (sub = "u-1", email = "e@x") =>
    ({
        requestContext: {
            authorizer: { jwt: { claims: { sub, email } } },
            http: { method: "POST" },
        },
    }) as never;

describe("POST /profile", () => {
    test("creates on first call (201) then returns existing (200)", async () => {
        const repos = composeInMemoryRepos();
        const handler = httpAdapter(upsertProfileLogic, {
            successStatus: (v) => (v.created ? 201 : 200),
            repos,
        });

        const r1 = (await handler(evt())) as { statusCode: number; body: string };
        expect(r1.statusCode).toBe(201);
        expect(JSON.parse(r1.body)).toMatchObject({ ok: true, data: { created: true } });

        const r2 = (await handler(evt())) as { statusCode: number; body: string };
        expect(r2.statusCode).toBe(200);
        expect(JSON.parse(r2.body)).toMatchObject({ ok: true, data: { created: false } });
    });
});
