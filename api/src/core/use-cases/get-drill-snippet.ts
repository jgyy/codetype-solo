import {
    apiError,
    err,
    ok,
    type ApiError,
    type Language,
    type Result,
    type Snippet,
} from "@codetype/shared";
import type { ClockPort, RngPort } from "../ports";

// Inline template bag. Spec calls these `data/drills/<lang>/*.tmpl` — keeping
// them in TS for now means no FS hop from a Lambda cold start, and avoids a
// "shared can't read FS" purity break. They render into ≤10-line snippets.
type Tmpl = { tmpl: string; bags: Record<string, string[]> };

const DRILLS: Record<Language, Record<string, Tmpl[]>> = {
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
        "template-literal": [
            {
                tmpl: "const msg = `hello ${{{name}}}, you have ${count} items`;",
                bags: { name: ["user", "name", "who"] },
            },
        ],
    },
    py: {
        fstring: [
            {
                tmpl: 'print(f"{{{name}}}: {{{value}}}")',
                bags: { name: ["count", "total"], value: ["n + 1", "items[0]"] },
            },
        ],
    },
    c: {
        "struct-arrow": [
            { tmpl: "if (p->{{f}} == NULL) return -1;", bags: { f: ["next", "data", "head"] } },
        ],
    },
    go: {
        "short-decl": [
            { tmpl: "x := {{n}}\nif err := f(x); err != nil { return err }", bags: { n: ["1", "42"] } },
        ],
    },
};

export type GetDrillDeps = { rng: RngPort; clock: ClockPort };

export type GetDrillInput = {
    sub: string | null;
    lang: Language;
    class: string;
};

export const getDrillSnippet =
    (d: GetDrillDeps) =>
    async (input: GetDrillInput): Promise<Result<Snippet, ApiError>> => {
        const byClass = DRILLS[input.lang]?.[input.class];
        if (!byClass || byClass.length === 0) {
            return err(apiError("not_found", "no drill template for class"));
        }
        // Deterministic seed per (sub|guest, day, class). Reload-stable.
        const day = d.clock.now().toISOString().slice(0, 10);
        const seed = hashStr(`${input.sub ?? "guest"}|${day}|${input.class}`);
        const rng = mulberry32(seed);

        const t = byClass[Math.floor(rng() * byClass.length)]!;
        const filled = render(t.tmpl, t.bags, rng);
        return ok({
            id: `drill-${input.lang}-${input.class}-${day}`,
            language: input.lang,
            title: `Drill: ${input.class}`,
            code: filled,
            difficulty: 1,
        });
    };

const render = (tmpl: string, bags: Record<string, string[]>, rng: () => number): string =>
    tmpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
        const bag = bags[k];
        if (!bag || bag.length === 0) return `{{${k}}}`;
        return bag[Math.floor(rng() * bag.length)]!;
    });

// FNV-1a — same family as the daily-challenge seed (invariant #4 in AGENTS.md).
const hashStr = (s: string): number => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
};

const mulberry32 = (seed: number) => {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};
