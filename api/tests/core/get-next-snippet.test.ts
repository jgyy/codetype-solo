import { describe, expect, test } from "bun:test";
import type { ErrorModel } from "@codetype/shared";
import { getNextSnippet } from "../../src/core/use-cases/get-next-snippet";
import { composeInMemoryRepos, type SnippetRow } from "../../src/repos";
import { seededRng } from "../../src/adapters/rng/system";

const snippets: SnippetRow[] = [
    { PK: "SNIPPET#js", SK: "SNIPPET#arrow", entity: "SNIPPET", id: "arrow", language: "js", title: "arrow", code: "const f = () => 1;", difficulty: 1 },
    { PK: "SNIPPET#js", SK: "SNIPPET#plain", entity: "SNIPPET", id: "plain", language: "js", title: "plain", code: "function f() { return 1; }", difficulty: 1 },
    { PK: "SNIPPET#js", SK: "SNIPPET#plain2", entity: "SNIPPET", id: "plain2", language: "js", title: "plain2", code: "var x = 1;", difficulty: 1 },
];

const arrowHeavy: ErrorModel = {
    v: 1,
    updated_at: "2026-05-10T00:00:00Z",
    bigrams: [{ b: "=>", weight: 1.0 }],
    classes: [{ c: "arrow", weight: 1.0 }],
    attempts_merged: 10,
};

describe("getNextSnippet use-case", () => {
    test("guest sub → always random regardless of mode", async () => {
        const repos = composeInMemoryRepos(snippets);
        const uc = getNextSnippet({
            snippets: repos.snippets,
            profiles: repos.profiles,
            rng: seededRng(42),
        });
        const r = await uc({ sub: null, lang: "js", mode: "adaptive" });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.selection_mode).toBe("random");
    });

    test("cold-start: warmed_up=false even when mode=adaptive", async () => {
        const repos = composeInMemoryRepos(snippets);
        await repos.profiles.upsert("u-1", { email: null });
        const uc = getNextSnippet({
            snippets: repos.snippets,
            profiles: repos.profiles,
            rng: seededRng(7),
        });
        const r = await uc({ sub: "u-1", lang: "js", mode: "adaptive" });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.selection_mode).toBe("warming_up");
    });

    test("warmed-up adaptive picks the arrow snippet ~most of the time", async () => {
        const repos = composeInMemoryRepos(snippets);
        await repos.profiles.upsert("u-1", { email: null });
        await repos.profiles.patch("u-1", { error_model: arrowHeavy });
        let arrows = 0;
        for (let i = 0; i < 200; i++) {
            const uc = getNextSnippet({
                snippets: repos.snippets,
                profiles: repos.profiles,
                rng: seededRng(i),
            });
            const r = await uc({ sub: "u-1", lang: "js", mode: "adaptive" });
            if (r.ok && r.value.snippet.id === "arrow") arrows++;
        }
        expect(arrows).toBeGreaterThan(120);
    });

    test("404 when language pool is empty", async () => {
        const repos = composeInMemoryRepos([]);
        const uc = getNextSnippet({
            snippets: repos.snippets,
            profiles: repos.profiles,
            rng: seededRng(1),
        });
        const r = await uc({ sub: null, lang: "js", mode: "random" });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("not_found");
    });
});
