import type { Language } from "../types";

export type ClassName = string;

export type ClassDetector = (snippet: string) => Map<ClassName, number>;

export const countMatches = (snippet: string, re: RegExp): number => {
    const m = snippet.match(re);
    return m ? m.length : 0;
};

export const addCount = (out: Map<ClassName, number>, name: ClassName, n: number) => {
    if (n > 0) out.set(name, (out.get(name) ?? 0) + n);
};

export type LanguageDetectors = Record<Language, ClassDetector>;
