import type { DrillTemplate } from "../../core/ports/drill-templates-port";

// .tmpl format:
//   # bag-name: a, b, c        (zero or more leading lines)
//   <template body — placeholders use {{bag-name}}>
//
// Lines starting with `#` declare token bags. Everything after the first
// non-`#` line is the template body verbatim.
export const parseDrillTmpl = (raw: string): DrillTemplate => {
    const lines = raw.split(/\r?\n/);
    const bags: Record<string, string[]> = {};
    let i = 0;
    while (i < lines.length && lines[i]!.startsWith("#")) {
        const line = lines[i]!.slice(1).trim();
        const colon = line.indexOf(":");
        if (colon > 0) {
            const name = line.slice(0, colon).trim();
            const vals = line
                .slice(colon + 1)
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
            if (name) bags[name] = vals;
        }
        i++;
    }
    const body = lines.slice(i).join("\n").replace(/\n+$/, "");
    return { tmpl: body, bags };
};
