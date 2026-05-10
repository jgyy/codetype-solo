import type { Timeline } from "./anticheat";
import { detectClasses, type ClassName } from "./symbol-classes";
import type { Language, Snippet } from "./types";

// Persisted on the user's PROFILE row. Bumping `v` forces a re-derive on read.
export type ErrorModel = {
    v: 1;
    updated_at: string; // ISO
    bigrams: Array<{ b: string; weight: number }>; // top-K, K=32
    classes: Array<{ c: ClassName; weight: number }>;
    attempts_merged: number;
};

export const MODEL_VERSION = 1 as const;
export const TOP_K_BIGRAMS = 32;
export const COLD_START_THRESHOLD = 5;
export const DECAY_DAYS = 14;
export const DECAY_FACTOR = 0.95;
export const ENTROPY_BLEND_THRESHOLD = 1; // bits

// EMA coefficient: how much weight a fresh attempt carries vs prior history.
const EMA_FRESH = 0.3;
const EMA_PRIOR = 0.7;

export type AnalyseInput = {
    snippet: string;
    language: Language;
    timeline: Timeline;
};

export type AttemptAnalysis = {
    bigrams: Map<string, number>; // bigram -> error rate ∈ [0,1]
    classes: Map<ClassName, number>; // class -> error rate ∈ [0,1]
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// Build the bigram error rate map from a single attempt's keystroke timeline.
// `bigram` = consecutive (correct) chars typed; rate = (errors at that bigram)
// / occurrences. Backspace and Enter sentinels are skipped.
export const analyseAttempt = ({ snippet, language, timeline }: AnalyseInput): AttemptAnalysis => {
    const bigramOcc = new Map<string, number>();
    const bigramErr = new Map<string, number>();

    const keys = timeline.k;
    const correct = timeline.c;

    let prevChar: string | null = null;
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i]!;
        if (k < 0) {
            prevChar = null; // backspace / enter resets bigram stream
            continue;
        }
        const ch = String.fromCharCode(k);
        if (prevChar !== null) {
            const bg = prevChar + ch;
            bigramOcc.set(bg, (bigramOcc.get(bg) ?? 0) + 1);
            if (correct[i] === 0) {
                bigramErr.set(bg, (bigramErr.get(bg) ?? 0) + 1);
            }
        }
        prevChar = ch;
    }

    const bigrams = new Map<string, number>();
    for (const [bg, occ] of bigramOcc) {
        const errs = bigramErr.get(bg) ?? 0;
        bigrams.set(bg, occ === 0 ? 0 : errs / occ);
    }

    // Class error rate: errors-on-keys / total-keys, scaled by class density
    // in the snippet. Keeps "you fumble arrow functions" distinct from "you
    // fumble in arrow-heavy snippets" — it's the latter we model.
    const totalKeys = keys.filter((k) => k >= 0).length;
    const totalErrs = correct.filter((c, i) => c === 0 && keys[i]! >= 0).length;
    const errRate = totalKeys === 0 ? 0 : totalErrs / totalKeys;

    const classOcc = detectClasses(language, snippet);
    const codeLen = Math.max(snippet.length, 1);
    const classes = new Map<ClassName, number>();
    for (const [name, occ] of classOcc) {
        const density = occ / codeLen;
        classes.set(name, clamp01(errRate * density * 50)); // density boost
    }

    return { bigrams, classes };
};

// Merge a fresh attempt analysis into the persisted model with an
// exponential moving average. Cold-start: prior=undefined → fresh dominates.
export const mergeModel = (
    prev: ErrorModel | undefined,
    fresh: AttemptAnalysis,
    now: Date,
): ErrorModel => {
    const decayed = prev ? decayIfStale(prev, now) : undefined;
    const priorBigrams = new Map(decayed?.bigrams.map((x) => [x.b, x.weight]) ?? []);
    const priorClasses = new Map(decayed?.classes.map((x) => [x.c, x.weight]) ?? []);

    const merged = (
        prior: Map<string, number>,
        next: Map<string, number>,
    ): Map<string, number> => {
        const out = new Map(prior);
        for (const [k, v] of next) {
            const old = out.get(k) ?? 0;
            out.set(k, clamp01(EMA_PRIOR * old + EMA_FRESH * v));
        }
        // No decay of unseen-this-attempt entries — those decay only on staleness.
        return out;
    };

    const bigrams = topK(merged(priorBigrams, fresh.bigrams), TOP_K_BIGRAMS);
    const classes = sortByWeight(merged(priorClasses, fresh.classes));

    return {
        v: MODEL_VERSION,
        updated_at: now.toISOString(),
        bigrams: bigrams.map(([b, weight]) => ({ b, weight })),
        classes: classes.map(([c, weight]) => ({ c, weight })),
        attempts_merged: (decayed?.attempts_merged ?? 0) + 1,
    };
};

const topK = (m: Map<string, number>, k: number): Array<[string, number]> =>
    sortByWeight(m).slice(0, k);

const sortByWeight = (m: Map<string, number>): Array<[string, number]> =>
    [...m.entries()].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]);

// Lazy decay: if the model hasn't been touched in DECAY_DAYS days, scale
// every weight by DECAY_FACTOR. Captures "user took a break, weakest spots
// likely faded somewhat" without a background job.
const decayIfStale = (m: ErrorModel, now: Date): ErrorModel => {
    const ageMs = now.getTime() - new Date(m.updated_at).getTime();
    if (ageMs < DECAY_DAYS * 24 * 60 * 60 * 1000) return m;
    return {
        ...m,
        bigrams: m.bigrams.map((x) => ({ b: x.b, weight: x.weight * DECAY_FACTOR })),
        classes: m.classes.map((x) => ({ c: x.c, weight: x.weight * DECAY_FACTOR })),
    };
};

// Score a candidate snippet against the user's model. Higher = better
// practice value. Pure: depends only on (snippet, model, recents).
export type ScoreOpts = { recentSnippetIds?: string[] };

export const scoreSnippet = (
    snippet: Snippet,
    model: ErrorModel,
    opts: ScoreOpts = {},
): number => {
    let score = 0;
    for (const { b, weight } of model.bigrams) {
        score += weight * countOcc(snippet.code, b);
    }
    const classOcc = detectClasses(snippet.language, snippet.code);
    for (const { c, weight } of model.classes) {
        if ((classOcc.get(c) ?? 0) > 0) score += 0.5 * weight;
    }
    const recents = opts.recentSnippetIds ?? [];
    const recencyIdx = recents.indexOf(snippet.id);
    if (recencyIdx >= 0) {
        // most-recent (idx 0) takes the heaviest hit
        score -= 0.1 * (recents.length - recencyIdx);
    }
    return Math.max(0, score);
};

const countOcc = (hay: string, needle: string): number => {
    if (!needle) return 0;
    let n = 0;
    let i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) {
        n++;
        i += needle.length;
    }
    return n;
};

// Softmax-sample one snippet from the pool, biased toward high-score
// candidates. T → 0 = greedy; T → ∞ = uniform.
export type PickOpts = ScoreOpts & { temperature?: number };

export const pickSnippet = (
    pool: Snippet[],
    model: ErrorModel,
    rng: () => number,
    opts: PickOpts = {},
): Snippet => {
    if (pool.length === 0) throw new Error("pickSnippet: empty pool");
    if (pool.length === 1) return pool[0]!;
    const T = opts.temperature ?? 0.7;
    const scores = pool.map((s) => scoreSnippet(s, model, opts));
    const probs = softmax(scores, T);
    const blended = blendIfLowEntropy(probs, pool.length);
    return sampleByProbs(pool, blended, rng);
};

const softmax = (xs: number[], T: number): number[] => {
    const safeT = T <= 0 ? 1e-6 : T;
    const max = Math.max(...xs);
    const exps = xs.map((x) => Math.exp((x - max) / safeT));
    const sum = exps.reduce((a, b) => a + b, 0) || 1;
    return exps.map((e) => e / sum);
};

// Spec risk: small pools collapse to 2-3 snippets. If the distribution's
// entropy drops below 1 bit, blend in 30% uniform to keep variety.
const blendIfLowEntropy = (probs: number[], n: number): number[] => {
    const H = -probs.reduce((a, p) => (p > 0 ? a + p * Math.log2(p) : a), 0);
    if (H >= ENTROPY_BLEND_THRESHOLD) return probs;
    const uniform = 1 / n;
    return probs.map((p) => 0.7 * p + 0.3 * uniform);
};

const sampleByProbs = <T>(items: T[], probs: number[], rng: () => number): T => {
    const r = rng();
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
        acc += probs[i]!;
        if (r <= acc) return items[i]!;
    }
    return items[items.length - 1]!;
};

export const isWarmedUp = (m: ErrorModel | undefined): boolean =>
    !!m && m.attempts_merged >= COLD_START_THRESHOLD;
