import { describe, expect, test } from "bun:test";
import type { DynamoDBRecord } from "aws-lambda";
import { decode } from "../../src/events/decode";

type Img = Record<string, unknown>;

function rec(args: {
    eventName: "INSERT" | "MODIFY" | "REMOVE";
    NewImage?: Img;
    OldImage?: Img;
}): DynamoDBRecord {
    const toAttr = (v: unknown): unknown => {
        if (typeof v === "string") return { S: v };
        if (typeof v === "number") return { N: String(v) };
        if (typeof v === "boolean") return { BOOL: v };
        if (v === null || v === undefined) return { NULL: true };
        if (Array.isArray(v)) return { L: v.map(toAttr) };
        if (typeof v === "object") {
            const m: Record<string, unknown> = {};
            for (const [k, vv] of Object.entries(v)) m[k] = toAttr(vv);
            return { M: m };
        }
        return { S: String(v) };
    };
    const toImg = (i: Img | undefined) => {
        if (!i) return undefined;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(i)) out[k] = toAttr(v);
        return out as DynamoDBRecord["dynamodb"] extends infer T
            ? T extends { NewImage?: infer X }
            ? X
            : never
            : never;
    };
    return {
        eventName: args.eventName,
        dynamodb: {
            NewImage: toImg(args.NewImage) as never,
            OldImage: toImg(args.OldImage) as never,
        },
    };
}

describe("decode", () => {
    test("ATTEMPT INSERT → AttemptRecorded with sub + language", () => {
        const ev = decode(
            rec({
                eventName: "INSERT",
                NewImage: {
                    PK: "USER#abc",
                    SK: "ATTEMPT#2026-01-01T00:00:00.000Z#xxxxxx",
                    entity: "ATTEMPT",
                    language: "js",
                    wpm_scaled: 80,
                },
            }),
        );
        expect(ev?.type).toBe("AttemptRecorded");
        if (ev?.type === "AttemptRecorded") {
            expect(ev.sub).toBe("abc");
            expect(ev.language).toBe("js");
        }
    });

    test("ATTEMPT MODIFY is ignored (attempts are immutable)", () => {
        const ev = decode(
            rec({
                eventName: "MODIFY",
                NewImage: { PK: "USER#abc", entity: "ATTEMPT", language: "js" },
                OldImage: { PK: "USER#abc", entity: "ATTEMPT", language: "js" },
            }),
        );
        expect(ev).toBeNull();
    });

    test("ATTEMPT with unknown language returns null", () => {
        const ev = decode(
            rec({
                eventName: "INSERT",
                NewImage: { PK: "USER#abc", entity: "ATTEMPT", language: "rust" },
            }),
        );
        expect(ev).toBeNull();
    });

    test("PROFILE INSERT → ProfileUpdated with previous=null", () => {
        const ev = decode(
            rec({
                eventName: "INSERT",
                NewImage: { PK: "USER#abc", SK: "PROFILE", entity: "PROFILE", handle: "alice" },
            }),
        );
        expect(ev?.type).toBe("ProfileUpdated");
        if (ev?.type === "ProfileUpdated") {
            expect(ev.sub).toBe("abc");
            expect(ev.previous).toBeNull();
        }
    });

    test("PROFILE MODIFY → ProfileUpdated carries old image", () => {
        const ev = decode(
            rec({
                eventName: "MODIFY",
                NewImage: { PK: "USER#abc", entity: "PROFILE", leaderboard_optin: true },
                OldImage: { PK: "USER#abc", entity: "PROFILE", leaderboard_optin: false },
            }),
        );
        expect(ev?.type).toBe("ProfileUpdated");
        if (ev?.type === "ProfileUpdated") {
            expect(ev.previous?.leaderboard_optin).toBe(false);
            expect(ev.image.leaderboard_optin).toBe(true);
        }
    });

    test("SUBMISSION pending → approved → SubmissionApproved", () => {
        const ev = decode(
            rec({
                eventName: "MODIFY",
                NewImage: { PK: "SUBMISSIONS", entity: "SUBMISSION", id: "s1", status: "approved" },
                OldImage: { PK: "SUBMISSIONS", entity: "SUBMISSION", id: "s1", status: "pending" },
            }),
        );
        expect(ev?.type).toBe("SubmissionApproved");
        if (ev?.type === "SubmissionApproved") expect(ev.submissionId).toBe("s1");
    });

    test("SUBMISSION MODIFY without status change is ignored", () => {
        const ev = decode(
            rec({
                eventName: "MODIFY",
                NewImage: { PK: "SUBMISSIONS", entity: "SUBMISSION", id: "s1", status: "pending", title: "new" },
                OldImage: { PK: "SUBMISSIONS", entity: "SUBMISSION", id: "s1", status: "pending", title: "old" },
            }),
        );
        expect(ev).toBeNull();
    });

    test("SUBMISSION INSERT (status=pending) is ignored", () => {
        const ev = decode(
            rec({
                eventName: "INSERT",
                NewImage: { PK: "SUBMISSIONS", entity: "SUBMISSION", id: "s1", status: "pending" },
            }),
        );
        expect(ev).toBeNull();
    });

    test("SUBMISSION pending → rejected → SubmissionRejected", () => {
        const ev = decode(
            rec({
                eventName: "MODIFY",
                NewImage: { PK: "SUBMISSIONS", entity: "SUBMISSION", id: "s1", status: "rejected" },
                OldImage: { PK: "SUBMISSIONS", entity: "SUBMISSION", id: "s1", status: "pending" },
            }),
        );
        expect(ev?.type).toBe("SubmissionRejected");
    });

    test("SNIPPET REMOVE → SnippetRetracted with language", () => {
        const ev = decode(
            rec({
                eventName: "REMOVE",
                OldImage: { PK: "SNIPPET#js", SK: "SNIPPET#abc", entity: "SNIPPET", id: "abc" },
            }),
        );
        expect(ev?.type).toBe("SnippetRetracted");
        if (ev?.type === "SnippetRetracted") {
            expect(ev.snippetId).toBe("abc");
            expect(ev.language).toBe("js");
        }
    });

    test("SNIPPET INSERT/MODIFY are ignored (only REMOVE matters)", () => {
        expect(
            decode(
                rec({
                    eventName: "INSERT",
                    NewImage: { PK: "SNIPPET#js", entity: "SNIPPET", id: "abc" },
                }),
            ),
        ).toBeNull();
    });

    test("rows without entity (e.g. LB rows) are ignored", () => {
        const ev = decode(
            rec({
                eventName: "INSERT",
                NewImage: { PK: "LB#js#2026-W01", SK: "USER#abc", wpm_scaled: 90 },
            }),
        );
        expect(ev).toBeNull();
    });

    test("unknown entity is ignored", () => {
        const ev = decode(
            rec({
                eventName: "INSERT",
                NewImage: { PK: "USER#abc", entity: "STREAK", value: 3 },
            }),
        );
        expect(ev).toBeNull();
    });
});
