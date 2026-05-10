import {
    apiError,
    err,
    ok,
    type ApiError,
    type Language,
    type Result,
    type Snippet,
} from "@codetype/shared";
import type { ClockPort, DrillTemplatesPort, RngPort } from "../ports";

export type GetDrillDeps = {
    rng: RngPort;
    clock: ClockPort;
    templates: DrillTemplatesPort;
};

export type GetDrillInput = {
    sub: string | null;
    lang: Language;
    class: string;
};

export const getDrillSnippet =
    (d: GetDrillDeps) =>
        async (input: GetDrillInput): Promise<Result<Snippet, ApiError>> => {
            const templates = d.templates.list(input.lang, input.class);
            if (templates.length === 0) {
                return err(apiError("not_found", "no drill template for class"));
            }
            const day = d.clock.now().toISOString().slice(0, 10);
            const seed = hashStr(`${input.sub ?? "guest"}|${day}|${input.class}`);
            const rng = mulberry32(seed);

            const t = templates[Math.floor(rng() * templates.length)]!;
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
