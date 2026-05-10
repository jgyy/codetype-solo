import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseDrillTmpl } from "../../src/adapters/drills/parse";
import { fsDrillTemplates } from "../../src/adapters/drills/fs";

describe("parseDrillTmpl", () => {
    test("extracts bags and body", () => {
        const t = parseDrillTmpl(`# name: a, b, c
# op: +, *
const x = {{name}} {{op}} 1;
`);
        expect(t.bags.name).toEqual(["a", "b", "c"]);
        expect(t.bags.op).toEqual(["+", "*"]);
        expect(t.tmpl).toBe("const x = {{name}} {{op}} 1;");
    });

    test("template with no bags is fine", () => {
        const t = parseDrillTmpl("just a body\n");
        expect(t.bags).toEqual({});
        expect(t.tmpl).toBe("just a body");
    });
});

describe("fsDrillTemplates", () => {
    // Reads the real `data/drills/` shipped in this repo.
    const repoRoot = join(import.meta.dir, "..", "..", "..");
    const templates = fsDrillTemplates(join(repoRoot, "data", "drills"));

    test("loads js/arrow.tmpl", () => {
        const list = templates.list("js", "arrow");
        expect(list.length).toBeGreaterThan(0);
        expect(list[0]!.tmpl).toContain("=>");
        expect(list[0]!.bags.name?.length ?? 0).toBeGreaterThan(0);
    });

    test("unknown class → empty array", () => {
        expect(templates.list("js", "no-such-class")).toEqual([]);
    });

    test("missing language directory does not throw", () => {
        // Use a path with no children — should yield empty lists, not crash.
        const empty = fsDrillTemplates(join(repoRoot, "data", "snippets"));
        expect(empty.list("js", "arrow")).toEqual([]);
    });
});
