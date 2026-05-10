import { describe, expect, test } from "bun:test";
import type { Language } from "@codetype/shared";
import { fakeClock } from "../../src/adapters/clock/fake";
import { buildUseCases } from "../../src/composition";
import { composeInMemoryRepos } from "../../src/repos";

const SNIPPET = {
    PK: "SNIPPET#js",
    SK: "SNIPPET#hello",
    entity: "SNIPPET" as const,
    id: "hello",
    language: "js" as Language,
    title: "Hello",
    code: "console.log('hi');\n",
    difficulty: 1,
};

const ATTEMPT_BODY = {
    client_attempt_id: "client-1",
    snippet_id: "hello",
    language: "js" as Language,
    chars_total: 100,
    chars_correct: 100,
    errors: 0,
    duration_ms: 60_000,
    accuracy: 1,
    wpm_gross: 20,
    wpm_net: 20,
    wpm_scaled: 20,
};

function makeUseCases() {
    const repos = composeInMemoryRepos([SNIPPET]);
    const clock = fakeClock("2026-05-10T12:00:00.000Z");
    return {
        repos,
        clock,
        uc: buildUseCases({ repos, clock, id: { newId: () => "fixed-id" } }),
    };
}

describe("getDailyChallenge", () => {
    test("seeds and returns a daily row using clock for default date", async () => {
        const { uc } = makeUseCases();
        const r = await uc.getDailyChallenge({});
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.SK).toBe("DATE#2026-05-10");
        expect(r.value.snippet_id).toBe("hello");
    });

    test("seed is deterministic across calls for the same date", async () => {
        const { uc } = makeUseCases();
        const a = await uc.getDailyChallenge({ date: "2026-05-11" });
        const b = await uc.getDailyChallenge({ date: "2026-05-11" });
        expect(a).toEqual(b);
    });
});

describe("recordAttempt", () => {
    test("persists with createdAt from clock and computes mismatch=false", async () => {
        const { uc, clock } = makeUseCases();
        const r = await uc.recordAttempt({ sub: "u-1", body: ATTEMPT_BODY });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect("duplicate" in r.value && r.value.duplicate).toBeFalsy();
        if ("duplicate" in r.value && r.value.duplicate) return;
        expect(r.value.wpm_mismatch).toBe(false);
        expect(r.value.sk.startsWith("ATTEMPT#")).toBe(true);
        expect(r.value.sk).toContain(clock.now().toISOString().slice(0, 10));
    });

    test("second call with same client_attempt_id returns duplicate", async () => {
        const { uc } = makeUseCases();
        await uc.recordAttempt({ sub: "u-1", body: ATTEMPT_BODY });
        const r2 = await uc.recordAttempt({ sub: "u-1", body: ATTEMPT_BODY });
        expect(r2.ok).toBe(true);
        if (!r2.ok) return;
        expect("duplicate" in r2.value && r2.value.duplicate).toBe(true);
    });

    test("flags wpm_mismatch when client numbers diverge from server recompute", async () => {
        const { uc } = makeUseCases();
        const r = await uc.recordAttempt({
            sub: "u-1",
            body: { ...ATTEMPT_BODY, wpm_gross: 999 },
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        if ("duplicate" in r.value && r.value.duplicate) return;
        expect(r.value.wpm_mismatch).toBe(true);
    });
});

describe("listAttempts", () => {
    test("returns recorded attempts for the user", async () => {
        const { uc } = makeUseCases();
        await uc.recordAttempt({ sub: "u-1", body: ATTEMPT_BODY });
        const r = await uc.listAttempts({ sub: "u-1" });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.items.length).toBe(1);
    });
});
