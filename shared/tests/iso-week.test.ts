import { describe, expect, test } from "bun:test";
import { isoWeek, padScaled } from "../src/iso-week";

describe("isoWeek", () => {
    test("returns ISO week format YYYY-Www", () => {
        expect(isoWeek(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    });

    test("week boundary on Monday", () => {
        expect(isoWeek(new Date("2026-05-04T00:00:00Z"))).toBe("2026-W19");
        expect(isoWeek(new Date("2026-05-10T23:59:59Z"))).toBe("2026-W19");
    });

    test("year-end week belongs to following year when Thursday is in next year", () => {
        expect(isoWeek(new Date("2024-12-30T12:00:00Z"))).toBe("2025-W01");
    });
});

describe("padScaled", () => {
    test("lexicographic order matches numeric order", () => {
        const inputs = [3.1, 12.0, 12.4, 99.9, 100.0, 1003.5];
        const padded = inputs.map(padScaled);
        const sorted = [...padded].sort();
        expect(sorted).toEqual(padded);
    });

    test("clamps negatives", () => {
        expect(padScaled(-5)).toBe("0000.0");
    });

    test("formats single decimal", () => {
        expect(padScaled(93.4)).toBe("0093.4");
        expect(padScaled(7)).toBe("0007.0");
    });
});
