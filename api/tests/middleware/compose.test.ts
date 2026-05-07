import { describe, expect, test } from "bun:test";
import { apiError, err, ok } from "@codetype/shared";
import {
    compose,
    withAuth,
    withErrorEnvelope,
    withLogger,
    withRepos,
    withRequestId,
    withSchema,
    type DomainHandler,
} from "../../src/middleware";
import { composeInMemoryRepos } from "../../src/repos";
import { z } from "zod";

const evt = (overrides: Record<string, unknown> = {}) =>
    ({
        requestContext: { requestId: "req-1", http: { method: "GET" } },
        headers: {},
        ...overrides,
    }) as never;

describe("compose", () => {
    test("threads ctx fields through middleware in declared order", async () => {
        const seen: string[] = [];
        const trace =
            (label: string) =>
            (next: DomainHandler): DomainHandler =>
                async (ctx) => {
                    seen.push(`${label}:before`);
                    const r = await next(ctx);
                    seen.push(`${label}:after`);
                    return r;
                };

        const h = compose(trace("a"), trace("b"))(async () => ok({ x: 1 }));
        await h(evt());
        expect(seen).toEqual(["a:before", "b:before", "b:after", "a:after"]);
    });

    test("withRequestId: prefers x-request-id header, falls back to requestContext", async () => {
        const seenIds: string[] = [];
        const inner: DomainHandler = async (ctx) => {
            seenIds.push(ctx.requestId);
            return ok({});
        };
        const h = compose(withRequestId())(inner);
        await h(evt({ headers: { "x-request-id": "header-id" } }));
        await h(evt({ headers: {} }));
        expect(seenIds[0]).toBe("header-id");
        expect(seenIds[1]).toBe("req-1");
    });

    test("withAuth({required:true}) short-circuits 401 without calling inner", async () => {
        let called = false;
        const inner: DomainHandler = async () => {
            called = true;
            return ok({});
        };
        const h = compose(withAuth({ required: true }))(inner);
        const r = (await h(evt())) as { statusCode: number; body: string };
        expect(r.statusCode).toBe(401);
        expect(called).toBe(false);
        expect(JSON.parse(r.body)).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    });

    test("withAuth({required:false}) lets unauthenticated requests through", async () => {
        const inner: DomainHandler = async (ctx) => ok({ caller: ctx.caller });
        const h = compose(withAuth({ required: false }))(inner);
        const r = (await h(evt())) as { statusCode: number; body: string };
        expect(r.statusCode).toBe(200);
        expect(JSON.parse(r.body).data.caller).toBeNull();
    });

    test("withSchema body: rejects malformed JSON with 400", async () => {
        const schema = z.object({ x: z.number() });
        const h = compose(withSchema(schema, "body"))(async () => ok({}));
        const r = (await h(evt({ body: "not-json", requestContext: { http: { method: "POST" } } }))) as {
            statusCode: number;
        };
        expect(r.statusCode).toBe(400);
    });

    test("withSchema query: surfaces validation errors with z.ZodIssue[] in details", async () => {
        const schema = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
        const h = compose(withSchema(schema, "query"))(async () => ok({}));
        const r = (await h(evt({ queryStringParameters: { from: "x" } }))) as {
            statusCode: number;
            body: string;
        };
        expect(r.statusCode).toBe(400);
        const body = JSON.parse(r.body);
        expect(body.error.code).toBe("bad_request");
        expect(Array.isArray(body.error.details)).toBe(true);
    });

    test("withErrorEnvelope catches throws from inner; never leaks stack to body", async () => {
        const inner: DomainHandler = async () => {
            throw new Error("boom: secret-internal-detail");
        };
        const h = compose(withRequestId(), withLogger(), withErrorEnvelope())(inner);
        const r = (await h(evt())) as { statusCode: number; body: string };
        expect(r.statusCode).toBe(500);
        expect(r.body).not.toContain("secret-internal-detail");
        expect(JSON.parse(r.body)).toEqual({
            ok: false,
            error: { code: "internal", message: "internal_error" },
        });
    });

    test("status mapping covers each ApiError code", async () => {
        const cases = [
            ["unauthorized", 401],
            ["bad_request", 400],
            ["not_found", 404],
            ["conflict", 409],
            ["rate_limited", 429],
            ["internal", 500],
        ] as const;
        for (const [code, status] of cases) {
            const h = compose()(async () => err(apiError(code, "m")));
            const r = (await h(evt())) as { statusCode: number };
            expect(r.statusCode).toBe(status);
        }
    });

    test("successStatus callback chooses status from value", async () => {
        type V = { created: boolean };
        const inner: DomainHandler<V> = async () => ok({ created: false });
        const h = compose<V>()(inner, { successStatus: (v) => (v.created ? 201 : 200) });
        const r = (await h(evt({ requestContext: { http: { method: "POST" } } }))) as { statusCode: number };
        expect(r.statusCode).toBe(200);
    });

    test("withRepos populates ctx.repos", async () => {
        const repos = composeInMemoryRepos();
        const inner: DomainHandler = async (ctx) => ok({ same: ctx.repos === repos });
        const h = compose(withRepos(repos))(inner);
        const r = (await h(evt())) as { statusCode: number; body: string };
        expect(r.statusCode).toBe(200);
        expect(JSON.parse(r.body).data.same).toBe(true);
    });
});
