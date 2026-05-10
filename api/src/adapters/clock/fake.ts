import type { ClockPort } from "../../core/ports/clock-port";

export type FakeClock = ClockPort & {
    advance(ms: number): void;
    set(d: Date | string): void;
};

export const fakeClock = (start: Date | string = "2026-01-01T00:00:00.000Z"): FakeClock => {
    let current = typeof start === "string" ? new Date(start) : new Date(start.getTime());
    return {
        now: () => new Date(current.getTime()),
        advance: (ms) => {
            current = new Date(current.getTime() + ms);
        },
        set: (d) => {
            current = typeof d === "string" ? new Date(d) : new Date(d.getTime());
        },
    };
};
