import { describe, expect, test } from "bun:test";
import { CHEAT_THRESHOLD, isoWeek } from "@codetype/shared";
import { leaderboardProjector } from "../../../src/events/projectors/leaderboard";
import type { AttemptRecorded } from "../../../src/events/types";
import { composeInMemoryRepos } from "../../../src/repos";
import { makeLogger } from "../../../src/lib/logger";

const NOW = new Date();
const log = makeLogger({ requestId: "test", route: "TEST" });

async function seedThreeCleanAttempts(repos: ReturnType<typeof composeInMemoryRepos>, sub: string) {
    for (let i = 0; i < 3; i++) {
        await repos.attempts.put({
            sub,
            clientAttemptId: `id-${i}`,
            snippetId: "js-001",
            language: "js",
            createdAt: new Date(NOW.getTime() - i * 60_000).toISOString(),
            wpmGross: 80, wpmNet: 80, wpmScaled: 80,
            accuracy: 1, errors: 0, durationMs: 60_000,
            charsTotal: 60, charsCorrect: 60, wpmMismatch: false,
        });
    }
}

const event = (image: Record<string, unknown>): AttemptRecorded => ({
    type: "AttemptRecorded",
    sub: "u-1",
    language: "js",
    image,
});

describe("leaderboardProjector", () => {
    test("opt-in user with 3+ clean attempts ends up on the leaderboard", async () => {
        const repos = composeInMemoryRepos();
        await repos.profiles.upsert("u-1", { email: "e@x" });
        await repos.profiles.patch("u-1", { handle: "kestrel", leaderboard_optin: true });
        await seedThreeCleanAttempts(repos, "u-1");

        const r = await leaderboardProjector.handle(event({ language: "js", wpm_scaled: 80 }), {
            repos,
            log,
        });
        expect(r.ok).toBe(true);

        const top = await repos.leaderboard.topN("js", isoWeek(NOW), 10);
        if (!top.ok) throw new Error();
        expect(top.value.length).toBe(1);
        expect(top.value[0]!.handle).toBe("kestrel");
    });

    test("cheat-flagged event short-circuits before any read", async () => {
        const repos = composeInMemoryRepos();
        await repos.profiles.upsert("u-1", { email: "e@x" });
        await repos.profiles.patch("u-1", { handle: "kestrel", leaderboard_optin: true });
        await seedThreeCleanAttempts(repos, "u-1");

        const r = await leaderboardProjector.handle(
            event({ language: "js", cheat_score: CHEAT_THRESHOLD }),
            { repos, log },
        );
        expect(r.ok).toBe(true);

        const top = await repos.leaderboard.topN("js", isoWeek(NOW), 10);
        if (!top.ok) throw new Error();
        expect(top.value.length).toBe(0);
    });

    test("re-delivery of the same event is a no-op (idempotent)", async () => {
        const repos = composeInMemoryRepos();
        await repos.profiles.upsert("u-1", { email: "e@x" });
        await repos.profiles.patch("u-1", { handle: "kestrel", leaderboard_optin: true });
        await seedThreeCleanAttempts(repos, "u-1");

        const ev = event({ language: "js", wpm_scaled: 80 });
        await leaderboardProjector.handle(ev, { repos, log });
        const before = await repos.leaderboard.topN("js", isoWeek(NOW), 10);
        await leaderboardProjector.handle(ev, { repos, log });
        const after = await repos.leaderboard.topN("js", isoWeek(NOW), 10);
        if (!before.ok || !after.ok) throw new Error();
        expect(after.value).toEqual(before.value);
    });

    test("non-AttemptRecorded events are ignored", async () => {
        const repos = composeInMemoryRepos();
        const r = await leaderboardProjector.handle(
            { type: "ProfileUpdated", sub: "u-1", image: {}, previous: null } as never,
            { repos, log },
        );
        expect(r.ok).toBe(true);
    });
});
