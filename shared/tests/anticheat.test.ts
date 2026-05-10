import { describe, expect, test } from "bun:test";
import {
    BACKSPACE,
    CHEAT_THRESHOLD,
    analyse,
    type Timeline,
} from "../src/anticheat";

function humanLike(n: number, baseDelay = 100, jitter = 25): Timeline {
    const t: number[] = [];
    const k: number[] = [];
    const c: (0 | 1)[] = [];
    let now = 200;
    for (let i = 0; i < n; i++) {
        t.push(now);
        k.push(97 + (i % 26));
        c.push(1);
        now += baseDelay + Math.round((Math.sin(i * 7.3) * jitter + jitter) / 2);
    }
    return { v: 1, t, k, c };
}

function pasted(n: number): Timeline {
    const t: number[] = [];
    const k: number[] = [];
    const c: (0 | 1)[] = [];
    for (let i = 0; i < n; i++) {
        t.push(150 + i * 4);
        k.push(97 + (i % 26));
        c.push(1);
    }
    return { v: 1, t, k, c };
}

function robotic(n: number): Timeline {
    const t: number[] = [];
    const k: number[] = [];
    const c: (0 | 1)[] = [];
    for (let i = 0; i < n; i++) {
        t.push(150 + i * 50);
        k.push(97 + (i % 26));
        c.push(1);
    }
    return { v: 1, t, k, c };
}

const totals = (chars: number, errors = 0, durationMs = 60_000) => ({
    chars,
    errors,
    durationMs,
});

describe("analyse — clean timelines", () => {
    test("human-like typing scores below threshold", () => {
        const r = analyse(humanLike(80), totals(80));
        expect(r.score).toBeLessThan(CHEAT_THRESHOLD);
    });

    test("short timelines (<10 keys) cannot trigger most heuristics", () => {
        const tl: Timeline = { v: 1, t: [200, 300, 400], k: [97, 98, 99], c: [1, 1, 1] };
        const r = analyse(tl, totals(3));
        expect(r.score).toBeLessThan(CHEAT_THRESHOLD);
    });
});

describe("analyse — flagged timelines", () => {
    test("paste burst is a hard flag (score = 1)", () => {
        const r = analyse(pasted(40), totals(40));
        expect(r.reasons).toContain("paste_burst");
        expect(r.score).toBe(1);
    });

    test("robotic uniformity flags uniform_timing", () => {
        const r = analyse(robotic(60), totals(60));
        expect(r.reasons).toContain("uniform_timing");
        expect(r.score).toBeGreaterThanOrEqual(0.5);
    });

    test("first keystroke <100ms triggers a flag", () => {
        const tl = humanLike(60);
        tl.t[0] = 50;
        const r = analyse(tl, totals(60));
        expect(r.reasons).toContain("first_keystroke_too_fast");
    });

    test("zero backspaces with errors=0 over 200 chars is a weak flag", () => {
        const r = analyse(humanLike(220), totals(220, 0));
        expect(r.reasons).toContain("no_backspace_no_errors");
    });

    test("backspace presence prevents the no_backspace weak flag", () => {
        const tl = humanLike(220);
        tl.k[100] = BACKSPACE;
        const r = analyse(tl, totals(220, 0));
        expect(r.reasons).not.toContain("no_backspace_no_errors");
    });

    test("warp gap (>5x median) is a weak flag", () => {
        const tl = humanLike(40, 80, 5);
        tl.t = tl.t.map((x, i) => (i >= 20 ? x + 1000 : x));
        const r = analyse(tl, totals(40));
        expect(r.reasons).toContain("warp_gap");
    });

    test("malformed timeline (mismatched lengths) is hard-flagged", () => {
        const r = analyse({ v: 1, t: [1, 2], k: [97], c: [1, 1] }, totals(2));
        expect(r.score).toBe(1);
        expect(r.reasons).toContain("malformed_timeline");
    });
});

describe("analyse — performance", () => {
    test("2000-event timeline runs in <50ms", () => {
        const tl = humanLike(2000);
        const start = performance.now();
        const r = analyse(tl, totals(2000));
        const dur = performance.now() - start;
        expect(dur).toBeLessThan(50);
        expect(typeof r.score).toBe("number");
    });
});
