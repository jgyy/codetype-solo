// Pure heuristics. Same module runs server-side at attempt-post and
// client-side as a "your run will be flagged" hint.

export type Timeline = {
    v: 1;
    t: number[]; // ms from start
    k: number[]; // ASCII or -1 (backspace) / -2 (enter)
    c: (0 | 1)[]; // correct?
};

export const BACKSPACE = -1;
export const ENTER = -2;

export type CheatReport = {
    score: number; // 0..1
    reasons: string[]; // human-readable tags
};

const W_WEAK = 0.2;
const W_FLAG = 0.5;
const W_HARD = 1.0;

export const CHEAT_THRESHOLD = 0.5;

type Severity = "weak" | "flag" | "hard";

type Heuristic = (
    tl: Timeline,
    totals: { chars: number; errors: number; durationMs: number },
) => { fired: boolean; severity: Severity; reason: string };

// 1) Paste burst: ≥30 chars within 200 ms.
const pasteBurst: Heuristic = (tl) => {
    const t = tl.t;
    if (t.length < 30) return { fired: false, severity: "hard", reason: "paste_burst" };
    for (let i = 29; i < t.length; i++) {
        if (t[i]! - t[i - 29]! <= 200) {
            return { fired: true, severity: "hard", reason: "paste_burst" };
        }
    }
    return { fired: false, severity: "hard", reason: "paste_burst" };
};

// 2) Suspicious uniformity: stdev(inter-key delays) < 8 ms over ≥50 keys.
const uniformity: Heuristic = (tl) => {
    if (tl.t.length < 50) return { fired: false, severity: "flag", reason: "uniform_timing" };
    const deltas: number[] = [];
    for (let i = 1; i < tl.t.length; i++) deltas.push(tl.t[i]! - tl.t[i - 1]!);
    const mean = deltas.reduce((s, x) => s + x, 0) / deltas.length;
    const variance =
        deltas.reduce((s, x) => s + (x - mean) ** 2, 0) / deltas.length;
    const stdev = Math.sqrt(variance);
    return {
        fired: stdev < 8,
        severity: "flag",
        reason: "uniform_timing",
    };
};

// 3) Backspace absence: 0 backspaces with errors == 0 and chars > 200.
const noBackspaceWithNoErrors: Heuristic = (tl, totals) => {
    if (totals.chars <= 200 || totals.errors !== 0) {
        return { fired: false, severity: "weak", reason: "no_backspace_no_errors" };
    }
    const hasBack = tl.k.some((k) => k === BACKSPACE);
    return {
        fired: !hasBack,
        severity: "weak",
        reason: "no_backspace_no_errors",
    };
};

// 4) First-keystroke offset: first t < 100 ms.
const firstKeystroke: Heuristic = (tl) => ({
    fired: tl.t.length > 0 && tl.t[0]! < 100,
    severity: "flag",
    reason: "first_keystroke_too_fast",
});

// 5) End-of-snippet warp: gap > 5x median between any two consecutive keys.
const warpGap: Heuristic = (tl) => {
    if (tl.t.length < 10) return { fired: false, severity: "weak", reason: "warp_gap" };
    const deltas: number[] = [];
    for (let i = 1; i < tl.t.length; i++) deltas.push(tl.t[i]! - tl.t[i - 1]!);
    const sorted = [...deltas].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    if (median <= 0) return { fired: false, severity: "weak", reason: "warp_gap" };
    const fired = deltas.some((d) => d > 5 * median);
    return { fired, severity: "weak", reason: "warp_gap" };
};

const ALL: Heuristic[] = [
    pasteBurst,
    uniformity,
    noBackspaceWithNoErrors,
    firstKeystroke,
    warpGap,
];

export function analyse(
    tl: Timeline,
    totals: { chars: number; errors: number; durationMs: number },
): CheatReport {
    if (tl.t.length !== tl.k.length || tl.k.length !== tl.c.length) {
        return { score: 1, reasons: ["malformed_timeline"] };
    }

    const reasons: string[] = [];
    let score = 0;
    for (const h of ALL) {
        const r = h(tl, totals);
        if (!r.fired) continue;
        reasons.push(r.reason);
        score +=
            r.severity === "hard" ? W_HARD : r.severity === "flag" ? W_FLAG : W_WEAK;
    }
    return { score: Math.min(1, Math.max(0, score)), reasons };
}
