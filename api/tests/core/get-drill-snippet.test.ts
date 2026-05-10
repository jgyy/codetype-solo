import { describe, expect, test } from "bun:test";
import { getDrillSnippet } from "../../src/core/use-cases/get-drill-snippet";
import { fakeClock } from "../../src/adapters/clock/fake";
import { systemRng } from "../../src/adapters/rng/system";
import { inMemoryDrillTemplates } from "../../src/adapters/drills/in-memory";

const templates = inMemoryDrillTemplates({
    js: {
        arrow: [
            {
                tmpl: "const {{name}} = ({{a}}, {{b}}) => {{a}} {{op}} {{b}};",
                bags: {
                    name: ["add", "mul", "combine", "fold"],
                    a: ["x", "lhs", "value"],
                    b: ["y", "rhs", "delta"],
                    op: ["+", "*", "-", "&&"],
                },
            },
        ],
    },
});

describe("getDrillSnippet use-case", () => {
    const deps = { rng: systemRng(), clock: fakeClock("2026-05-10T12:00:00Z"), templates };

    test("deterministic per (sub, day, class)", async () => {
        const uc = getDrillSnippet(deps);
        const a = await uc({ sub: "u-1", lang: "js", class: "arrow" });
        const b = await uc({ sub: "u-1", lang: "js", class: "arrow" });
        expect(a.ok && b.ok && a.value.code).toBe(b.ok ? b.value.code : "");
    });

    test("different subs sample the template bag (at least 2 distinct over 20 subs)", async () => {
        const uc = getDrillSnippet(deps);
        const seen = new Set<string>();
        for (let i = 0; i < 20; i++) {
            const r = await uc({ sub: `u-${i}`, lang: "js", class: "arrow" });
            if (r.ok) seen.add(r.value.code);
        }
        expect(seen.size).toBeGreaterThan(1);
    });

    test("404 for an unknown class", async () => {
        const uc = getDrillSnippet(deps);
        const r = await uc({ sub: "u-1", lang: "js", class: "nonsense-class" });
        expect(r.ok).toBe(false);
    });

    test("renders without leftover placeholders", async () => {
        const uc = getDrillSnippet(deps);
        const r = await uc({ sub: "u-1", lang: "js", class: "arrow" });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.code).not.toContain("{{");
    });
});
