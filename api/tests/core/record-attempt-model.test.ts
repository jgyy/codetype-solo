import { describe, expect, test } from "bun:test";
import type { PostAttemptBody, Timeline } from "@codetype/shared";
import { recordAttempt } from "../../src/core/use-cases/record-attempt";
import { composeInMemoryRepos, type SnippetRow } from "../../src/repos";
import { fakeClock } from "../../src/adapters/clock/fake";

const arrowSnippet: SnippetRow = {
    PK: "SNIPPET#js",
    SK: "SNIPPET#arrow-1",
    entity: "SNIPPET",
    id: "arrow-1",
    language: "js",
    title: "arrow",
    code: "const f = () => 1;",
    difficulty: 1,
};

const arrowMisstypeTimeline = (): Timeline => {
    const code = "const f = () => 1;";
    const t: number[] = [];
    const k: number[] = [];
    const c: (0 | 1)[] = [];
    for (let i = 0; i < code.length; i++) {
        const ch = code.charCodeAt(i);
        t.push(i * 50);
        k.push(ch);
        c.push(code[i] === ">" ? 0 : 1);
    }
    return { v: 1, t, k, c };
};

const body = (): PostAttemptBody => ({
    client_attempt_id: `c-${Math.random()}`,
    snippet_id: "arrow-1",
    language: "js",
    duration_ms: 5000,
    chars_total: 18,
    chars_correct: 17,
    errors: 1,
    accuracy: 17 / 18,
    wpm_gross: 36,
    wpm_net: 30,
    wpm_scaled: 32,
    timeline: arrowMisstypeTimeline(),
});

describe("recordAttempt error-model integration", () => {
    test("10 attempts on `=>`-erroring snippet → arrow-class weight crosses 0.6", async () => {
        const repos = composeInMemoryRepos([arrowSnippet]);
        await repos.profiles.upsert("u-1", { email: null });
        const uc = recordAttempt({
            attempts: repos.attempts,
            clock: fakeClock("2026-05-10T00:00:00Z"),
            profiles: repos.profiles,
            snippets: repos.snippets,
        });

        for (let i = 0; i < 10; i++) {
            const r = await uc({ sub: "u-1", body: body() });
            expect(r.ok).toBe(true);
        }
        await new Promise((r) => setTimeout(r, 20));

        const profile = await repos.profiles.get("u-1");
        expect(profile.ok && !!profile.value?.error_model).toBe(true);
        if (profile.ok && profile.value?.error_model) {
            const m = profile.value.error_model;
            expect(m.attempts_merged).toBeGreaterThan(0);
            const arrow = m.bigrams.find((x) => x.b === "=>");
            expect(arrow?.weight ?? 0).toBeGreaterThan(0.6);
        }
    });

    test("cold-start: 4 attempts → not warmed up; 5 → warmed up", async () => {
        const repos = composeInMemoryRepos([arrowSnippet]);
        await repos.profiles.upsert("u-1", { email: null });
        const uc = recordAttempt({
            attempts: repos.attempts,
            clock: fakeClock("2026-05-10T00:00:00Z"),
            profiles: repos.profiles,
            snippets: repos.snippets,
        });

        for (let i = 0; i < 4; i++) await uc({ sub: "u-1", body: body() });
        await new Promise((r) => setTimeout(r, 20));
        let p = await repos.profiles.get("u-1");
        expect(p.ok && (p.value?.error_model?.attempts_merged ?? 0) < 5).toBe(true);

        await uc({ sub: "u-1", body: body() });
        await new Promise((r) => setTimeout(r, 20));
        p = await repos.profiles.get("u-1");
        expect(p.ok && (p.value?.error_model?.attempts_merged ?? 0) >= 5).toBe(true);
    });
});
