import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Language } from "@codetype/shared";
import type { DrillTemplate, DrillTemplatesPort } from "../../core/ports/drill-templates-port";
import { parseDrillTmpl } from "./parse";

// Reads `<root>/<lang>/<class>.tmpl` files at construction time and caches
// them. Lambda-init friendly: zero per-request FS hops.
export const fsDrillTemplates = (root: string): DrillTemplatesPort => {
    const cache = new Map<string, DrillTemplate[]>();
    const langs: Language[] = ["js", "py", "c", "go"];
    for (const lang of langs) {
        const dir = join(root, lang);
        let files: string[] = [];
        try {
            files = readdirSync(dir);
        } catch {
            continue; // no drills for this language is fine
        }
        for (const f of files) {
            if (!f.endsWith(".tmpl")) continue;
            const klass = f.slice(0, -".tmpl".length);
            const raw = readFileSync(join(dir, f), "utf8");
            const key = `${lang}|${klass}`;
            const existing = cache.get(key) ?? [];
            existing.push(parseDrillTmpl(raw));
            cache.set(key, existing);
        }
    }
    return {
        list: (lang, klass) => cache.get(`${lang}|${klass}`) ?? [],
    };
};
