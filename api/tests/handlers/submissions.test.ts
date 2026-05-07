import { describe, expect, test } from "bun:test";
import {
    ListSubmissionsQuery,
    RejectBody,
    SubmissionBody,
    SubmissionIdParam,
    RetractParam,
} from "@codetype/shared";
import {
    compose,
    withAuth,
    withErrorEnvelope,
    withLogger,
    withRepos,
    withRequestId,
    withSchema,
} from "../../src/middleware";
import { submitSnippetLogic } from "../../src/handlers/submissions-post";
import { listSubmissionsLogic } from "../../src/handlers/submissions-list";
import { approveSubmissionLogic } from "../../src/handlers/submissions-approve";
import { rejectSubmissionLogic } from "../../src/handlers/submissions-reject";
import { retractSnippetLogic } from "../../src/handlers/snippet-retract";
import { composeInMemoryRepos } from "../../src/repos";

const userClaims = { sub: "u-1", email: "u@x" };
const modClaims = { sub: "mod-1", email: "m@x", "cognito:groups": ["mods"] };

const evt = (
    overrides: { method?: string; claims?: Record<string, unknown>; body?: unknown; query?: Record<string, string>; path?: Record<string, string> } = {},
) =>
    ({
        requestContext: {
            authorizer: overrides.claims ? { jwt: { claims: overrides.claims } } : undefined,
            http: { method: overrides.method ?? "POST" },
        },
        headers: {},
        body: overrides.body === undefined ? undefined : typeof overrides.body === "string" ? overrides.body : JSON.stringify(overrides.body),
        queryStringParameters: overrides.query,
        pathParameters: overrides.path,
    }) as never;

const validBody = {
    language: "js" as const,
    title: "Array reduce",
    code: "const sum = (xs) => xs.reduce((a, b) => a + b, 0);",
    difficulty: 2,
};

describe("POST /snippets/submissions", () => {
    const make = () => {
        const repos = composeInMemoryRepos();
        const handler = compose(
            withRequestId(),
            withLogger(),
            withErrorEnvelope(),
            withRepos(repos),
            withAuth({ required: true }),
            withSchema(SubmissionBody),
        )(submitSnippetLogic, { successStatus: 201 });
        return { repos, handler };
    };

    test("creates a PENDING submission for the authenticated user", async () => {
        const { handler, repos } = make();
        const r = (await handler(evt({ claims: userClaims, body: validBody }))) as {
            statusCode: number; body: string;
        };
        expect(r.statusCode).toBe(201);
        expect(JSON.parse(r.body).data).toMatchObject({ status: "PENDING" });
        const list = await repos.submissions.listByUser("u-1");
        if (!list.ok) throw new Error();
        expect(list.value.length).toBe(1);
    });

    test("rejects unauthenticated requests", async () => {
        const { handler } = make();
        const r = (await handler(evt({ body: validBody }))) as { statusCode: number };
        expect(r.statusCode).toBe(401);
    });

    test("rejects body shorter than 20 chars", async () => {
        const { handler } = make();
        const r = (await handler(
            evt({ claims: userClaims, body: { ...validBody, code: "short" } }),
        )) as { statusCode: number };
        expect(r.statusCode).toBe(400);
    });

    test("rate-limits at 5 submissions per 24h", async () => {
        const { handler, repos } = make();
        for (let i = 0; i < 5; i++) {
            await repos.submissions.put({ ...validBody, submitterSub: "u-1" });
        }
        const r = (await handler(evt({ claims: userClaims, body: validBody }))) as {
            statusCode: number; body: string;
        };
        expect(r.statusCode).toBe(429);
        expect(JSON.parse(r.body).error.code).toBe("rate_limited");
    });
});

describe("GET /snippets/submissions", () => {
    const make = () => {
        const repos = composeInMemoryRepos();
        const handler = compose(
            withRequestId(),
            withLogger(),
            withErrorEnvelope(),
            withRepos(repos),
            withAuth({ required: true }),
            withSchema(ListSubmissionsQuery, "query"),
        )(listSubmissionsLogic, { successStatus: 200 });
        return { repos, handler };
    };

    test("?mine=true returns the caller's submissions", async () => {
        const { handler, repos } = make();
        await repos.submissions.put({ ...validBody, submitterSub: "u-1" });
        await repos.submissions.put({ ...validBody, submitterSub: "u-2" });
        const r = (await handler(
            evt({ method: "GET", claims: userClaims, query: { mine: "true" } }),
        )) as { statusCode: number; body: string };
        expect(r.statusCode).toBe(200);
        const items = JSON.parse(r.body).data.items;
        expect(items.length).toBe(1);
        expect(items[0].submitter_sub).toBe("u-1");
    });

    test("?status=PENDING requires mod group", async () => {
        const { handler } = make();
        const r = (await handler(
            evt({ method: "GET", claims: userClaims, query: { status: "PENDING" } }),
        )) as { statusCode: number };
        expect(r.statusCode).toBe(401);
    });

    test("?status=PENDING returns full queue for mods", async () => {
        const { handler, repos } = make();
        await repos.submissions.put({ ...validBody, submitterSub: "u-1" });
        await repos.submissions.put({ ...validBody, submitterSub: "u-2" });
        const r = (await handler(
            evt({ method: "GET", claims: modClaims, query: { status: "PENDING" } }),
        )) as { statusCode: number; body: string };
        expect(r.statusCode).toBe(200);
        expect(JSON.parse(r.body).data.items.length).toBe(2);
    });

    test("missing query returns 400", async () => {
        const { handler } = make();
        const r = (await handler(
            evt({ method: "GET", claims: userClaims, query: {} }),
        )) as { statusCode: number };
        expect(r.statusCode).toBe(400);
    });
});

describe("POST /snippets/submissions/:id/approve", () => {
    const make = () => {
        const repos = composeInMemoryRepos();
        const handler = compose(
            withRequestId(),
            withLogger(),
            withErrorEnvelope(),
            withRepos(repos),
            withAuth({ required: true, group: "mods" }),
            withSchema(SubmissionIdParam, "path"),
        )(approveSubmissionLogic, { successStatus: 200 });
        return { repos, handler };
    };

    test("non-mod gets 401", async () => {
        const { handler } = make();
        const r = (await handler(
            evt({ claims: userClaims, path: { id: "x" } }),
        )) as { statusCode: number };
        expect(r.statusCode).toBe(401);
    });

    test("mod approves a pending submission, snippet becomes available", async () => {
        const { handler, repos } = make();
        const sub = await repos.submissions.put({ ...validBody, submitterSub: "u-1" });
        if (!sub.ok) throw new Error();
        const r = (await handler(
            evt({ claims: modClaims, path: { id: sub.value.id } }),
        )) as { statusCode: number; body: string };
        expect(r.statusCode).toBe(200);
        const data = JSON.parse(r.body).data;
        expect(data.snippetId).toMatch(/^sub-/);
        const snip = await repos.snippets.get("js", data.snippetId);
        expect(snip.ok).toBe(true);
    });

    test("returns 404 when id is unknown", async () => {
        const { handler } = make();
        const r = (await handler(
            evt({ claims: modClaims, path: { id: "does-not-exist" } }),
        )) as { statusCode: number };
        expect(r.statusCode).toBe(404);
    });
});

describe("POST /snippets/submissions/:id/reject", () => {
    test("mod rejects with reason; second reject is conflict", async () => {
        const repos = composeInMemoryRepos();
        const handler = compose(
            withRequestId(),
            withLogger(),
            withErrorEnvelope(),
            withRepos(repos),
            withAuth({ required: true, group: "mods" }),
            withSchema(RejectBody),
        )(rejectSubmissionLogic, { successStatus: 200 });

        const sub = await repos.submissions.put({ ...validBody, submitterSub: "u-1" });
        if (!sub.ok) throw new Error();

        const r1 = (await handler(
            evt({ claims: modClaims, body: { reason: "off-topic" }, path: { id: sub.value.id } }),
        )) as { statusCode: number };
        expect(r1.statusCode).toBe(200);

        const r2 = (await handler(
            evt({ claims: modClaims, body: { reason: "again" }, path: { id: sub.value.id } }),
        )) as { statusCode: number };
        expect(r2.statusCode).toBe(409);
    });
});

describe("POST /snippets/:lang/:id/retract", () => {
    test("retract turns a SNIPPET into SNIPPET_RETIRED", async () => {
        const repos = composeInMemoryRepos();
        const handler = compose(
            withRequestId(),
            withLogger(),
            withErrorEnvelope(),
            withRepos(repos),
            withAuth({ required: true, group: "mods" }),
            withSchema(RetractParam, "path"),
        )(retractSnippetLogic, { successStatus: 200 });

        const sub = await repos.submissions.put({ ...validBody, submitterSub: "u-1" });
        if (!sub.ok) throw new Error();
        const ap = await repos.submissions.approve(sub.value.id, "mod-1");
        if (!ap.ok) throw new Error();

        const r = (await handler(
            evt({ claims: modClaims, path: { lang: "js", id: ap.value.snippetId } }),
        )) as { statusCode: number };
        expect(r.statusCode).toBe(200);
        const after = await repos.snippets.get("js", ap.value.snippetId);
        expect(after.ok).toBe(false);
    });

    test("non-mod is rejected", async () => {
        const repos = composeInMemoryRepos();
        const handler = compose(
            withRequestId(),
            withLogger(),
            withErrorEnvelope(),
            withRepos(repos),
            withAuth({ required: true, group: "mods" }),
            withSchema(RetractParam, "path"),
        )(retractSnippetLogic, { successStatus: 200 });
        const r = (await handler(
            evt({ claims: userClaims, path: { lang: "js", id: "sub-x" } }),
        )) as { statusCode: number };
        expect(r.statusCode).toBe(401);
    });
});
