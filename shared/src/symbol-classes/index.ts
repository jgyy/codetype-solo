import type { Language } from "../types";
import { detectC } from "./c";
import { detectGo } from "./go";
import { detectJs } from "./js";
import { detectPy } from "./py";
import type { ClassDetector, ClassName } from "./types";

export type { ClassName, ClassDetector } from "./types";

const DETECTORS: Record<Language, ClassDetector> = {
    js: detectJs,
    py: detectPy,
    c: detectC,
    go: detectGo,
};

export const detectClasses = (lang: Language, snippet: string): Map<ClassName, number> =>
    DETECTORS[lang](snippet);
