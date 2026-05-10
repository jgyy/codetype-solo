import { addCount, countMatches, type ClassDetector } from "./types";

// Class names are stable identifiers — they're persisted in the user's
// error model. Renaming one is a data migration.
export const JS_CLASSES = [
    "arrow",
    "template-literal",
    "optional-chain",
    "null-coalesce",
    "destructure",
    "spread",
    "strict-equals",
    "indent",
] as const;

export const detectJs: ClassDetector = (s) => {
    const out = new Map<string, number>();
    addCount(out, "arrow", countMatches(s, /=>/g));
    addCount(out, "template-literal", countMatches(s, /`/g));
    addCount(out, "optional-chain", countMatches(s, /\?\./g));
    addCount(out, "null-coalesce", countMatches(s, /\?\?/g));
    // Heuristic destructure: `{ ... }` or `[ ... ]` immediately after `const|let|var` or `=`.
    addCount(out, "destructure", countMatches(s, /(?:const|let|var|=)\s*[{\[]/g));
    addCount(out, "spread", countMatches(s, /\.\.\./g));
    addCount(out, "strict-equals", countMatches(s, /={2,3}|!={1,2}/g));
    addCount(out, "indent", countMatches(s, /\n {2,}/g));
    return out;
};
