import type { ClockPort } from "../core/ports/clock-port";
import type { Mw } from "./types";

export function withClock(clock: ClockPort): Mw {
    return (next) => async (ctx) => {
        ctx.clock = clock;
        return next(ctx);
    };
}
