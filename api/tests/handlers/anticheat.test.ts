import { describe, expect, test } from "bun:test";
import { PostAttemptBody, isoWeek } from "@codetype/shared";
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

const baseEvent = (body: unknown) =>
    ({
        requestContext: {
            authorizer: { jwt: { claims: { sub: "u-1", email: "e@x" } } },
            http: { method: "POST" },
            requestId: "r-1",
        },
        headers: {},
        body: JSON.stringify(body),
    }) as never;

const validBody = {
    client_attempt_id: "c1",
    snippet_id: "js-001",
    language: "js",
    wpm_gross: 60,
    wpm_net: 60,
    wpm_scaled: 60,
    accuracy: 1,
    errors: 0,
    duration_ms: 60_000,
    chars_total: 60,
    chars_correct: 60,
};

// 40-char paste burst — triggers hard flag on its own.
const pasteTimeline = {
    v: 1 as const,
    t: Array.from({ length: 40 }, (_, i) => 150 + i * 4),
    k: Array.from({ length: 40 }, (_, i) => 97 + (i % 26)),
    c: Array.from({ length: 40 }, () => 1 as 0 | 1),
};

const make = () => {
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

describe("attempts-post + anticheat", () => {
    test("absent timeline skips analysis (no cheat fields)", async () => {
        const { handler, repos } = make();
        const r = (await handler(baseEvent(validBody))) as { statusCode: number; body: string };
        expect(r.statusCode).toBe(201);
        const data = JSON.parse(r.body).data;
        expect(data.cheat_score).toBeUndefined();
        const list = await repos.attempts.listByUser("u-1", { from: "1970-01-01", to: "9999-12-31" });
        if (!list.ok) throw new Error();
        expect(list.value[0]!.cheat_score).toBeUndefined();
    });

    test("paste-burst timeline yields cheat_score=1 and is excluded from LB", async () => {
        const { handler, repos } = make();
        // Opt the user into the leaderboard so we can verify exclusion.
        await repos.profiles.upsert("u-1", { email: "e@x" });
        await repos.profiles.patch("u-1", { handle: "kestrel", leaderboard_optin: true });

        // Three flagged attempts in window — would otherwise meet MIN_ATTEMPTS.
        for (let i = 0; i < 3; i++) {
            const r = (await handler(
                baseEvent({
                    ...validBody,
                    client_attempt_id: `c${i}`,
                    timeline: pasteTimeline,
                }),
            )) as { statusCode: number; body: string };
            expect(r.statusCode).toBe(201);
            const data = JSON.parse(r.body).data;
            expect(data.cheat_score).toBe(1);
            expect(data.cheat_reasons).toContain("paste_burst");
            expect(data.leaderboard_updated).toBe(false);
        }

        const week = isoWeek(new Date());
        const top = await repos.leaderboard.topN("js", week, 10);
        if (!top.ok) throw new Error();
        // No entry — all attempts were flagged, so the in-window "valid" count
        // stays below MIN_ATTEMPTS.
        expect(top.value.length).toBe(0);
    });

    test("clean timeline does not block LB", async () => {
        const { handler, repos } = make();
        await repos.profiles.upsert("u-1", { email: "e@x" });
        await repos.profiles.patch("u-1", { handle: "kestrel", leaderboard_optin: true });

        const cleanTimeline = {
            v: 1 as const,
            t: Array.from({ length: 60 }, (_, i) => 200 + i * 100 + (i % 3) * 13),
            k: Array.from({ length: 60 }, (_, i) => 97 + (i % 26)),
            c: Array.from({ length: 60 }, () => 1 as 0 | 1),
        };

        for (let i = 0; i < 3; i++) {
            await handler(
                baseEvent({ ...validBody, client_attempt_id: `c${i}`, timeline: cleanTimeline }),
            );
        }

        const week = isoWeek(new Date());
        const top = await repos.leaderboard.topN("js", week, 10);
        if (!top.ok) throw new Error();
        expect(top.value.length).toBe(1);
        expect(top.value[0]!.handle).toBe("kestrel");
    });
});
