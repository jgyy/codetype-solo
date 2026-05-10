import { describe, expect, test } from "bun:test";
import { fakeClock } from "../../src/adapters/clock/fake";
import { systemClock } from "../../src/adapters/clock/system";
import { seqId } from "../../src/adapters/id/seq";
import { uuidId } from "../../src/adapters/id/uuid";

describe("clock adapters", () => {
    test("systemClock returns wall time", () => {
        const before = Date.now();
        const t = systemClock().now().getTime();
        const after = Date.now();
        expect(t).toBeGreaterThanOrEqual(before);
        expect(t).toBeLessThanOrEqual(after);
    });

    test("fakeClock starts deterministic and advances", () => {
        const c = fakeClock("2026-05-10T00:00:00.000Z");
        expect(c.now().toISOString()).toBe("2026-05-10T00:00:00.000Z");
        c.advance(1000);
        expect(c.now().toISOString()).toBe("2026-05-10T00:00:01.000Z");
        c.set("2030-01-01T00:00:00.000Z");
        expect(c.now().toISOString()).toBe("2030-01-01T00:00:00.000Z");
    });

    test("fakeClock returns fresh Date objects (no aliasing)", () => {
        const c = fakeClock();
        const a = c.now();
        c.advance(5000);
        const b = c.now();
        expect(a.getTime()).not.toBe(b.getTime());
    });
});

describe("id adapters", () => {
    test("seqId is deterministic", () => {
        const id = seqId("att");
        expect(id.newId()).toBe("att-1");
        expect(id.newId()).toBe("att-2");
    });

    test("uuidId returns a uuid-shaped string", () => {
        const v = uuidId().newId();
        expect(v).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
});
