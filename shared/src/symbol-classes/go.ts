import { addCount, countMatches, type ClassDetector } from "./types";

export const GO_CLASSES = [
    "short-decl",
    "channel",
    "gofmt-tab",
    "interface-method",
    "pointer-deref",
    "struct-tag",
] as const;

export const detectGo: ClassDetector = (s) => {
    const out = new Map<string, number>();
    addCount(out, "short-decl", countMatches(s, /:=/g));
    addCount(out, "channel", countMatches(s, /<-/g));
    addCount(out, "gofmt-tab", countMatches(s, /\n\t+/g));
    addCount(out, "interface-method", countMatches(s, /\binterface\s*{/g));
    addCount(out, "pointer-deref", countMatches(s, /\*\w/g));
    addCount(out, "struct-tag", countMatches(s, /`\w+:"/g));
    return out;
};
