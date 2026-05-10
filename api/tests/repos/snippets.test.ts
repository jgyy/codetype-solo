import { describe, expect, test } from "bun:test";
import {
    makeInMemorySnippetsRepo,
    withGsi2Keys,
    type SnippetRow,
} from "../../src/repos/snippets";

const row = (lang: SnippetRow["language"], id: string): SnippetRow => ({
    PK: `SNIPPET#${lang}`,
    SK: `SNIPPET#${id}`,
    entity: "SNIPPET",
    id,
    language: lang,
    title: `${lang}-${id}`,
    code: "x;",
    difficulty: 2,
});

describe("SnippetsRepo (in-memory) — spec 009", () => {
    test("withGsi2Keys derives GSI2PK/GSI2SK from language and id", () => {
        const r = withGsi2Keys(row("js", "001"));
        expect(r.GSI2PK).toBe("LANG#js");
        expect(r.GSI2SK).toBe("SNIPPET#001");
    });

    test("withGsi2Keys is a no-op when keys already present", () => {
        const seeded = { ...row("js", "001"), GSI2PK: "X", GSI2SK: "Y" };
        const r = withGsi2Keys(seeded);
        expect(r.GSI2PK).toBe("X");
        expect(r.GSI2SK).toBe("Y");
    });

    test("listByLanguage returns only snippets in that language", async () => {
        const repo = makeInMemorySnippetsRepo([
            row("js", "1"),
            row("js", "2"),
            row("py", "10"),
            row("c", "100"),
        ]);
        const js = await repo.listByLanguage("js");
        const py = await repo.listByLanguage("py");
        const go = await repo.listByLanguage("go");
        if (!js.ok || !py.ok || !go.ok) throw new Error();
        expect(js.value.map((r) => r.id)).toEqual(["1", "2"]);
        expect(py.value.map((r) => r.id)).toEqual(["10"]);
        expect(go.value.length).toBe(0);
    });

    test("listAll returns SNIPPET rows across every language", async () => {
        const repo = makeInMemorySnippetsRepo([
            row("js", "1"),
            row("py", "2"),
            row("c", "3"),
            row("go", "4"),
        ]);
        const r = await repo.listAll();
        if (!r.ok) throw new Error();
        expect(r.value.length).toBe(4);
    });

    test("retract removes a row from listByLanguage and listAll", async () => {
        const repo = makeInMemorySnippetsRepo([row("js", "1"), row("js", "2")]);
        await repo.retract("js", "1");
        const list = await repo.listByLanguage("js");
        if (!list.ok) throw new Error();
        expect(list.value.map((r) => r.id)).toEqual(["2"]);
    });

    test("put without GSI2 keys still ends up indexed", async () => {
        const repo = makeInMemorySnippetsRepo();
        await repo.put({ ...row("py", "abc") });
        const r = await repo.listByLanguage("py");
        if (!r.ok) throw new Error();
        expect(r.value.length).toBe(1);
        expect(r.value[0]!.GSI2PK).toBe("LANG#py");
    });
});
