import { describe, expect, test } from "bun:test";
import { isoWeek } from "@codetype/shared";
import { syncLeaderboardForUser } from "../../src/lib/lb-sync";
import { composeInMemoryRepos } from "../../src/repos";

const NOW = new Date("2026-05-07T12:00:00.000Z");
const week = isoWeek(NOW);

async function seedAttempts(repos: ReturnType<typeof composeInMemoryRepos>, sub: string, count: number, scaledMax = 80) {
    for (let i = 0; i < count; i++) {
        await repos.attempts.put({
            sub,
            clientAttemptId: `id-${i}`,
            snippetId: "js-001",
            language: "js",
            createdAt: new Date(NOW.getTime() - i * 60_000).toISOString(),
            wpmGross: scaledMax,
            wpmNet: scaledMax,
            wpmScaled: i === 0 ? scaledMax : scaledMax - 5,
            accuracy: 1,
            errors: 0,
            durationMs: 60_000,
            charsTotal: 60,
            charsCorrect: 60,
            wpmMismatch: false,
        });
    }
}

describe("syncLeaderboardForUser", () => {
    test("no-op when user has no profile", async () => {
        const repos = composeInMemoryRepos();
        await seedAttempts(repos, "u-1", 5);
        await syncLeaderboardForUser(repos, "u-1", "js", NOW);
        const top = await repos.leaderboard.topN("js", week, 10);
        if (!top.ok) throw new Error();
        expect(top.value.length).toBe(0);
    });

    test("no-op when leaderboard_optin is false", async () => {
        const repos = composeInMemoryRepos();
        await repos.profiles.upsert("u-1", { email: "e@x" });
        await repos.profiles.patch("u-1", { handle: "kestrel", leaderboard_optin: false });
        await seedAttempts(repos, "u-1", 5);
        await syncLeaderboardForUser(repos, "u-1", "js", NOW);
        const top = await repos.leaderboard.topN("js", week, 10);
        if (!top.ok) throw new Error();
        expect(top.value.length).toBe(0);
    });

    test("writes entry when opted in and has ≥3 attempts in window", async () => {
        const repos = composeInMemoryRepos();
        await repos.profiles.upsert("u-1", { email: "e@x" });
        await repos.profiles.patch("u-1", { handle: "kestrel", leaderboard_optin: true });
        await seedAttempts(repos, "u-1", 3, 80);
        await syncLeaderboardForUser(repos, "u-1", "js", NOW);
        const top = await repos.leaderboard.topN("js", week, 10);
        if (!top.ok) throw new Error();
        expect(top.value.length).toBe(1);
        expect(top.value[0]!.handle).toBe("kestrel");
        expect(top.value[0]!.wpm_scaled).toBe(80);
        expect(top.value[0]!.attempts_in_window).toBe(3);
    });

    test("removes entry when count drops below 3", async () => {
        const repos = composeInMemoryRepos();
        await repos.profiles.upsert("u-1", { email: "e@x" });
        await repos.profiles.patch("u-1", { handle: "kestrel", leaderboard_optin: true });
        await seedAttempts(repos, "u-1", 3, 80);
        await syncLeaderboardForUser(repos, "u-1", "js", NOW);

        // Simulate a fresh week (no attempts in this window) by syncing for
        // a date >7 days after the seeded attempts.
        const future = new Date(NOW.getTime() + 8 * 86_400_000);
        await syncLeaderboardForUser(repos, "u-1", "js", future);
        const top = await repos.leaderboard.topN("js", isoWeek(future), 10);
        if (!top.ok) throw new Error();
        expect(top.value.length).toBe(0);
    });

    test("score regression is a no-op (preserves prior personal best)", async () => {
        const repos = composeInMemoryRepos();
        await repos.profiles.upsert("u-1", { email: "e@x" });
        await repos.profiles.patch("u-1", { handle: "kestrel", leaderboard_optin: true });
        await seedAttempts(repos, "u-1", 3, 90);
        await syncLeaderboardForUser(repos, "u-1", "js", NOW);

        // A second sync with no new attempts shouldn't regress the entry.
        await syncLeaderboardForUser(repos, "u-1", "js", NOW);
        const top = await repos.leaderboard.topN("js", week, 10);
        if (!top.ok) throw new Error();
        expect(top.value[0]!.wpm_scaled).toBe(90);
    });
});
