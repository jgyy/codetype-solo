import { describe, expect, test } from "bun:test";
import {
    analyseAttempt,
    isWarmedUp,
    mergeModel,
    pickSnippet,
    scoreSnippet,
    type ErrorModel,
} from "../src/error-model";
import type { Snippet } from "../src/types";
import type { Timeline } from "../src/anticheat";

const tl = (chars: string, correct: number[]): Timeline => ({
    v: 1,
    t: chars.split("").map((_, i) => i * 50),
    k: chars.split("").map((c) => c.charCodeAt(0)),
    c: correct as (0 | 1)[],
});

const allCorrect = (s: string): number[] => s.split("").map(() => 1);

describe("analyseAttempt", () => {
    test("counts bigram errors as fresh-rate", () => {
        const snippet = "a => b";
        const code = "a=>b";
        const correct = [1, 1, 0, 1];
        const r = analyseAttempt({ snippet, language: "js", timeline: tl(code, correct) });
        expect(r.bigrams.get("=>")).toBeCloseTo(1.0);
        expect(r.bigrams.get("a=")).toBeCloseTo(0);
    });

    test("backspace resets bigram stream", () => {
        const r = analyseAttempt({
            snippet: "ab",
            language: "js",
            timeline: { v: 1, t: [0, 50, 100], k: [97, -1, 98], c: [1, 1, 1] },
        });
        expect(r.bigrams.size).toBe(0);
    });

    test("includes detected classes for the language", () => {
        const r = analyseAttempt({
            snippet: "const f = () => 1;",
            language: "js",
            timeline: tl("const f = () => 1;", allCorrect("const f = () => 1;")),
        });
        for (const v of r.classes.values()) expect(v).toBe(0);
    });
});

describe("mergeModel", () => {
    const now = new Date("2026-05-10T00:00:00Z");

    test("cold start: prior=undefined → fresh dominates", () => {
        const fresh = {
            bigrams: new Map([["=>", 1.0]]),
            classes: new Map([["arrow", 1.0]]),
        };
        const m = mergeModel(undefined, fresh, now);
        expect(m.attempts_merged).toBe(1);
        expect(m.bigrams[0]?.b).toBe("=>");
        expect(m.bigrams[0]?.weight).toBeCloseTo(0.3);
    });

    test("EMA convergence: repeated identical attempts asymptote", () => {
        let m: ErrorModel | undefined;
        const fresh = {
            bigrams: new Map([["=>", 1.0]]),
            classes: new Map<string, number>(),
        };
        for (let i = 0; i < 50; i++) m = mergeModel(m, fresh, now);
        expect(m!.attempts_merged).toBe(50);
        expect(m!.bigrams[0]!.weight).toBeGreaterThan(0.95);
        expect(m!.bigrams[0]!.weight).toBeLessThanOrEqual(1.0);
    });

    test("decays stale model on read", () => {
        const stale: ErrorModel = {
            v: 1,
            updated_at: "2026-04-01T00:00:00Z",
            bigrams: [{ b: "=>", weight: 0.8 }],
            classes: [],
            attempts_merged: 10,
        };
        const m = mergeModel(stale, { bigrams: new Map(), classes: new Map() }, now);
        expect(m.bigrams[0]!.weight).toBeCloseTo(0.76, 2);
    });
});

describe("pickSnippet", () => {
    const pool: Snippet[] = [
        { id: "arrow", language: "js", title: "", code: "const f = () => 1;", difficulty: 1 },
        { id: "plain", language: "js", title: "", code: "function f() { return 1; }", difficulty: 1 },
    ];
    const arrowHeavy: ErrorModel = {
        v: 1,
        updated_at: "2026-05-10T00:00:00Z",
        bigrams: [{ b: "=>", weight: 1.0 }],
        classes: [],
        attempts_merged: 10,
    };

    test("seeded RNG yields deterministic output", () => {
        const a = pickSnippet(pool, arrowHeavy, () => 0.1);
        const b = pickSnippet(pool, arrowHeavy, () => 0.1);
        expect(a.id).toBe(b.id);
    });

    test("low T → biased toward arrow (entropy-blend caps it ~85%)", () => {
        let arrow = 0;
        for (let i = 0; i < 1000; i++) {
            const r = Math.random;
            const s = pickSnippet(pool, arrowHeavy, () => r(), { temperature: 0.05 });
            if (s.id === "arrow") arrow++;
        }
        // 70% softmax-argmax + 30% uniform when entropy < 1 bit ≈ 85%
        expect(arrow).toBeGreaterThan(800);
        expect(arrow).toBeLessThan(900);
    });

    test("high T → near-uniform", () => {
        let arrow = 0;
        for (let i = 0; i < 1000; i++) {
            const r = Math.random;
            const s = pickSnippet(pool, arrowHeavy, () => r(), { temperature: 100 });
            if (s.id === "arrow") arrow++;
        }
        expect(arrow).toBeGreaterThan(400);
        expect(arrow).toBeLessThan(600);
    });

    test("scoreSnippet always >= 0", () => {
        for (const s of pool) {
            expect(scoreSnippet(s, arrowHeavy)).toBeGreaterThanOrEqual(0);
        }
    });
});

describe("isWarmedUp", () => {
    test("undefined → false", () => expect(isWarmedUp(undefined)).toBe(false));
    test("4 attempts → false", () =>
        expect(
            isWarmedUp({
                v: 1,
                updated_at: "",
                bigrams: [],
                classes: [],
                attempts_merged: 4,
            }),
        ).toBe(false));
    test("5 attempts → true", () =>
        expect(
            isWarmedUp({
                v: 1,
                updated_at: "",
                bigrams: [],
                classes: [],
                attempts_merged: 5,
            }),
        ).toBe(true));
});
