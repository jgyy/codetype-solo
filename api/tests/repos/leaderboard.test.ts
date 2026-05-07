import { describe, expect, test } from "bun:test";
import { makeInMemoryLeaderboardRepo } from "../../src/repos/leaderboard";

const baseEntry = (overrides: Partial<Parameters<ReturnType<typeof makeInMemoryLeaderboardRepo>["upsert"]>[2]> = {}) => ({
    sub: "u-1",
    handle: "kestrel",
    wpm_scaled: 80,
    attempts_in_window: 5,
    updated_at: "2026-05-07T00:00:00.000Z",
    ...overrides,
});

describe("LeaderboardRepo (in-memory)", () => {
    test("upsert writes a new entry; topN returns it descending", async () => {
        const lb = makeInMemoryLeaderboardRepo();
        await lb.upsert("js", "2026-W19", baseEntry({ sub: "a", wpm_scaled: 50 }));
        await lb.upsert("js", "2026-W19", baseEntry({ sub: "b", wpm_scaled: 90 }));
        await lb.upsert("js", "2026-W19", baseEntry({ sub: "c", wpm_scaled: 70 }));
        const r = await lb.topN("js", "2026-W19", 10);
        if (!r.ok) throw new Error("topN failed");
        expect(r.value.map((e) => e.sub)).toEqual(["b", "c", "a"]);
    });

    test("score improvement removes old SK and writes new SK", async () => {
        const lb = makeInMemoryLeaderboardRepo();
        await lb.upsert("js", "2026-W19", baseEntry({ wpm_scaled: 50 }));
        const after1 = await lb.topN("js", "2026-W19", 10);
        if (!after1.ok) throw new Error();
        expect(after1.value.length).toBe(1);

        const r = await lb.upsert("js", "2026-W19", baseEntry({ wpm_scaled: 80 }));
        if (!r.ok) throw new Error();
        expect(r.value.updated).toBe(true);
        const after2 = await lb.topN("js", "2026-W19", 10);
        if (!after2.ok) throw new Error();
        expect(after2.value.length).toBe(1); // still only one entry per user
        expect(after2.value[0]!.wpm_scaled).toBe(80);
    });

    test("score regression is a no-op", async () => {
        const lb = makeInMemoryLeaderboardRepo();
        await lb.upsert("js", "2026-W19", baseEntry({ wpm_scaled: 80 }));
        const r = await lb.upsert("js", "2026-W19", baseEntry({ wpm_scaled: 50 }));
        if (!r.ok) throw new Error();
        expect(r.value.updated).toBe(false);
        const list = await lb.topN("js", "2026-W19", 10);
        if (!list.ok) throw new Error();
        expect(list.value[0]!.wpm_scaled).toBe(80);
    });

    test("remove deletes both the entry and the per-user state", async () => {
        const lb = makeInMemoryLeaderboardRepo();
        await lb.upsert("js", "2026-W19", baseEntry({ wpm_scaled: 80 }));
        await lb.remove("js", "2026-W19", "u-1");
        const list = await lb.topN("js", "2026-W19", 10);
        if (!list.ok) throw new Error();
        expect(list.value.length).toBe(0);
        const state = await lb.getState("u-1", "js", "2026-W19");
        if (!state.ok) throw new Error();
        expect(state.value).toBeNull();
    });

    test("partitions are isolated by lang and week", async () => {
        const lb = makeInMemoryLeaderboardRepo();
        await lb.upsert("js", "2026-W19", baseEntry({ wpm_scaled: 80 }));
        await lb.upsert("py", "2026-W19", baseEntry({ wpm_scaled: 60 }));
        await lb.upsert("js", "2026-W18", baseEntry({ wpm_scaled: 70 }));
        const js19 = await lb.topN("js", "2026-W19", 10);
        const py19 = await lb.topN("py", "2026-W19", 10);
        const js18 = await lb.topN("js", "2026-W18", 10);
        if (!js19.ok || !py19.ok || !js18.ok) throw new Error();
        expect(js19.value.length).toBe(1);
        expect(py19.value.length).toBe(1);
        expect(js18.value.length).toBe(1);
        expect(js19.value[0]!.wpm_scaled).toBe(80);
        expect(py19.value[0]!.wpm_scaled).toBe(60);
    });
});
