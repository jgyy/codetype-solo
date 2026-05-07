import { describe, expect, test } from "bun:test";
import { composeInMemoryRepos } from "../../src/repos";

const submission = {
    submitterSub: "u-1",
    language: "js" as const,
    title: "Sample",
    code: "const x = 1; const y = 2; const z = x + y;",
    difficulty: 2,
};

describe("SubmissionsRepo (in-memory)", () => {
    test("put returns id and status PENDING; listByUser sees it", async () => {
        const repos = composeInMemoryRepos();
        const r = await repos.submissions.put(submission);
        if (!r.ok) throw new Error();
        const list = await repos.submissions.listByUser("u-1");
        if (!list.ok) throw new Error();
        expect(list.value.length).toBe(1);
        expect(list.value[0]!.id).toBe(r.value.id);
        expect(list.value[0]!.status).toBe("PENDING");
    });

    test("listPending is FIFO chronologically", async () => {
        const repos = composeInMemoryRepos();
        await repos.submissions.put(submission, new Date("2026-05-01T00:00:00Z"));
        await repos.submissions.put(submission, new Date("2026-05-02T00:00:00Z"));
        await repos.submissions.put(submission, new Date("2026-05-03T00:00:00Z"));
        const r = await repos.submissions.listPending();
        if (!r.ok) throw new Error();
        const dates = r.value.map((s) => s.created_at);
        expect(dates).toEqual([...dates].sort());
    });

    test("countLast24h returns only items within the window", async () => {
        const repos = composeInMemoryRepos();
        const now = new Date("2026-05-07T12:00:00Z");
        await repos.submissions.put(submission, new Date(now.getTime() - 23 * 60 * 60 * 1000));
        await repos.submissions.put(submission, new Date(now.getTime() - 25 * 60 * 60 * 1000));
        const r = await repos.submissions.countLast24h("u-1", now);
        if (!r.ok) throw new Error();
        expect(r.value).toBe(1);
    });

    test("approve writes a SNIPPET row and marks submission APPROVED", async () => {
        const repos = composeInMemoryRepos();
        const r = await repos.submissions.put(submission);
        if (!r.ok) throw new Error();
        const ap = await repos.submissions.approve(r.value.id, "mod-1");
        if (!ap.ok) throw new Error();
        const snippetRes = await repos.snippets.get("js", ap.value.snippetId);
        if (!snippetRes.ok) throw new Error("snippet not written by approve");
        expect(snippetRes.value.title).toBe("Sample");
        const list = await repos.submissions.listByUser("u-1");
        if (!list.ok) throw new Error();
        expect(list.value[0]!.status).toBe("APPROVED");
        expect(list.value[0]!.approved_snippet_id).toBe(ap.value.snippetId);
    });

    test("approve a second time returns conflict", async () => {
        const repos = composeInMemoryRepos();
        const r = await repos.submissions.put(submission);
        if (!r.ok) throw new Error();
        await repos.submissions.approve(r.value.id, "mod-1");
        const ap2 = await repos.submissions.approve(r.value.id, "mod-1");
        expect(ap2.ok).toBe(false);
        if (!ap2.ok) expect(ap2.error.code).toBe("conflict");
    });

    test("reject sets REJECTED with reason", async () => {
        const repos = composeInMemoryRepos();
        const r = await repos.submissions.put(submission);
        if (!r.ok) throw new Error();
        const rj = await repos.submissions.reject(r.value.id, "mod-1", "off-topic");
        if (!rj.ok) throw new Error();
        const list = await repos.submissions.listByUser("u-1");
        if (!list.ok) throw new Error();
        expect(list.value[0]!.status).toBe("REJECTED");
        expect(list.value[0]!.reject_reason).toBe("off-topic");
    });

    test("approve uses the current ISO time and snippetId derives from id", async () => {
        const repos = composeInMemoryRepos();
        const r = await repos.submissions.put(submission);
        if (!r.ok) throw new Error();
        const ap = await repos.submissions.approve(r.value.id, "mod-1");
        if (!ap.ok) throw new Error();
        expect(ap.value.snippetId.startsWith("sub-")).toBe(true);
    });

    test("retract removes a SNIPPET from listAll and from get()", async () => {
        const repos = composeInMemoryRepos();
        const r = await repos.submissions.put(submission);
        if (!r.ok) throw new Error();
        const ap = await repos.submissions.approve(r.value.id, "mod-1");
        if (!ap.ok) throw new Error();

        const before = await repos.snippets.listAll();
        if (!before.ok) throw new Error();
        expect(before.value.length).toBe(1);

        const rt = await repos.snippets.retract("js", ap.value.snippetId);
        if (!rt.ok) throw new Error();

        const after = await repos.snippets.listAll();
        if (!after.ok) throw new Error();
        expect(after.value.length).toBe(0);
        const get = await repos.snippets.get("js", ap.value.snippetId);
        expect(get.ok).toBe(false);
    });
});
