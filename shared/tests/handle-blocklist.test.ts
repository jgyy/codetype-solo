import { describe, expect, test } from "bun:test";
import { handleIsBlocked } from "../src/handle-blocklist";
import { HandleSchema } from "../src/schemas/leaderboard";

describe("handle blocklist", () => {
    test("blocks reserved tokens (substring, case-insensitive)", () => {
        expect(handleIsBlocked("admin")).toBe(true);
        expect(handleIsBlocked("Admin1")).toBe(true);
        expect(handleIsBlocked("ANTHROPIC_fan")).toBe(true);
    });
    test("allows benign handles", () => {
        expect(handleIsBlocked("kestrel")).toBe(false);
        expect(handleIsBlocked("type-r")).toBe(false);
    });
});

describe("HandleSchema", () => {
    test("accepts allowed character set", () => {
        expect(HandleSchema.safeParse("kestrel-23").success).toBe(true);
        expect(HandleSchema.safeParse("ab").success).toBe(true);
    });
    test("rejects too short / too long", () => {
        expect(HandleSchema.safeParse("a").success).toBe(false);
        expect(HandleSchema.safeParse("x".repeat(25)).success).toBe(false);
    });
    test("rejects uppercase or special chars", () => {
        expect(HandleSchema.safeParse("Kestrel").success).toBe(false);
        expect(HandleSchema.safeParse("hello world").success).toBe(false);
    });
});
