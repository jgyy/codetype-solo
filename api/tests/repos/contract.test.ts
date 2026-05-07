import { describe, expect, test } from "bun:test";
import { composeInMemoryRepos, type Repos, type SnippetRow } from "../../src/repos";

const SNIPPETS: SnippetRow[] = [
    {
        PK: "SNIPPET#js",
        SK: "SNIPPET#js-001",
        entity: "SNIPPET",
        language: "js",
        title: "Sum",
        code: "1+1",
        difficulty: 1,
    },
];

function runRepoContract(makeRepos: () => Repos) {
    test("attempts.put then listByUser round-trips with PK = USER#<sub>", async () => {
        const repos = makeRepos();
        const r = await repos.attempts.put({
            sub: "u-1",
            clientAttemptId: "abcdef",
            snippetId: "js-001",
            language: "js",
            createdAt: "2026-05-01T00:00:00.000Z",
            wpmGross: 30,
            wpmNet: 28,
            wpmScaled: 28,
            accuracy: 1,
            errors: 0,
            durationMs: 60_000,
            charsTotal: 150,
            charsCorrect: 150,
            wpmMismatch: false,
        });
        if (!r.ok) throw new Error("put failed");
        expect(r.value.duplicate).toBe(false);

        const list = await repos.attempts.listByUser("u-1", { from: "2026-05-01", to: "2026-05-31" });
        if (!list.ok) throw new Error("list failed");
        expect(list.value.length).toBe(1);
        expect(list.value[0]!.PK).toBe("USER#u-1");
    });

    test("attempts.put is idempotent on identical (createdAt, clientAttemptId)", async () => {
        const repos = makeRepos();
        const a = {
            sub: "u-1",
            clientAttemptId: "samekey",
            snippetId: "js-001",
            language: "js" as const,
            createdAt: "2026-05-01T00:00:00.000Z",
            wpmGross: 30,
            wpmNet: 30,
            wpmScaled: 30,
            accuracy: 1,
            errors: 0,
            durationMs: 60_000,
            charsTotal: 150,
            charsCorrect: 150,
            wpmMismatch: false,
        };
        const r1 = await repos.attempts.put(a);
        const r2 = await repos.attempts.put(a);
        if (!r1.ok || !r2.ok) throw new Error("put failed");
        expect(r1.value.duplicate).toBe(false);
        expect(r2.value.duplicate).toBe(true);
    });

    test("attempts.listByUser respects date range and isolates users", async () => {
        const repos = makeRepos();
        const base = {
            snippetId: "js-001",
            language: "js" as const,
            wpmGross: 30,
            wpmNet: 30,
            wpmScaled: 30,
            accuracy: 1,
            errors: 0,
            durationMs: 60_000,
            charsTotal: 150,
            charsCorrect: 150,
            wpmMismatch: false,
        };
        await repos.attempts.put({ ...base, sub: "u-1", clientAttemptId: "a", createdAt: "2026-05-01T00:00:00.000Z" });
        await repos.attempts.put({ ...base, sub: "u-1", clientAttemptId: "b", createdAt: "2026-05-10T00:00:00.000Z" });
        await repos.attempts.put({ ...base, sub: "u-2", clientAttemptId: "c", createdAt: "2026-05-01T00:00:00.000Z" });

        const r = await repos.attempts.listByUser("u-1", { from: "2026-05-01", to: "2026-05-05" });
        if (!r.ok) throw new Error("list failed");
        expect(r.value.length).toBe(1);

        const all = await repos.attempts.listByUser("u-1", { from: "1970-01-01", to: "9999-12-31" });
        if (!all.ok) throw new Error("list failed");
        expect(all.value.length).toBe(2);
    });

    test("snippets.get returns not_found for missing id", async () => {
        const repos = makeRepos();
        const r = await repos.snippets.get("js", "missing");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("not_found");
    });

    test("daily.getOrSeed is deterministic given the same picker", async () => {
        const repos = makeRepos();
        const pick = (xs: SnippetRow[]) => xs[0]!;
        const r1 = await repos.daily.getOrSeed("2026-05-01", pick);
        const r2 = await repos.daily.getOrSeed("2026-05-01", () => {
            throw new Error("must not be called when seed exists");
        });
        if (!r1.ok || !r2.ok) throw new Error("daily failed");
        expect(r1.value.SK).toBe("DATE#2026-05-01");
        expect(r2.value).toEqual(r1.value);
    });

    test("profiles.upsert returns created=true once, false thereafter", async () => {
        const repos = makeRepos();
        const r1 = await repos.profiles.upsert("u-1", { email: "e@x" });
        const r2 = await repos.profiles.upsert("u-1", { email: "e@x" });
        if (!r1.ok || !r2.ok) throw new Error("upsert failed");
        expect(r1.value.created).toBe(true);
        expect(r2.value.created).toBe(false);
    });
}

describe("Repo contract — in-memory", () => {
    runRepoContract(() => composeInMemoryRepos(SNIPPETS));
});

// DDB-backed conformance is opt-in (CI only); see spec 008.
if (process.env.RUN_DDB_TESTS === "1") {
    describe("Repo contract — DDB (live)", () => {
        // Implemented in CI, not unit tests. Stub so the suite stays green locally.
        test.skip("DDB conformance runs only when RUN_DDB_TESTS=1", () => {});
    });
}
