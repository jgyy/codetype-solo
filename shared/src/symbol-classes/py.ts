import { addCount, countMatches, type ClassDetector } from "./types";

export const PY_CLASSES = [
    "indent-step",
    "fstring",
    "decorator",
    "walrus",
    "double-colon-slice",
    "type-hint",
    "double-star",
] as const;

export const detectPy: ClassDetector = (s) => {
    const out = new Map<string, number>();
    addCount(out, "indent-step", countMatches(s, /\n {4,}/g));
    addCount(out, "fstring", countMatches(s, /\bf"|\bf'/g));
    addCount(out, "decorator", countMatches(s, /^\s*@\w/gm));
    addCount(out, "walrus", countMatches(s, /:=/g));
    addCount(out, "double-colon-slice", countMatches(s, /::/g));
    // Heuristic type hint: `name: Type`
    addCount(out, "type-hint", countMatches(s, /\b\w+\s*:\s*[A-Z][\w\[\]]*/g));
    addCount(out, "double-star", countMatches(s, /\*\*/g));
    return out;
};
