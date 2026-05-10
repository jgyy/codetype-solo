import { addCount, countMatches, type ClassDetector } from "./types";

export const C_CLASSES = [
    "pointer-deref",
    "struct-arrow",
    "preprocessor",
    "address-of",
    "shift",
    "ternary",
    "indent",
] as const;

export const detectC: ClassDetector = (s) => {
    const out = new Map<string, number>();
    // `*x` deref or `int *p` decl: `*` adjacent to an identifier.
    addCount(out, "pointer-deref", countMatches(s, /\*\w/g));
    addCount(out, "struct-arrow", countMatches(s, /->/g));
    addCount(out, "preprocessor", countMatches(s, /^\s*#\w+/gm));
    addCount(out, "address-of", countMatches(s, /(?<![&\w])&\w/g));
    addCount(out, "shift", countMatches(s, /<<|>>/g));
    addCount(out, "ternary", countMatches(s, /\?[^.:]/g));
    addCount(out, "indent", countMatches(s, /\n {2,}|\n\t+/g));
    return out;
};
