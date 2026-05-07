import type { Logger, Mw } from "./types";

function makeLogger(requestId: string): Logger {
    const emit = (level: "info" | "warn" | "error") =>
        (msg: string, meta: Record<string, unknown> = {}) => {
            const line = JSON.stringify({ level, requestId, msg, ...meta });
            // eslint-disable-next-line no-console
            (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
        };
    return { info: emit("info"), warn: emit("warn"), error: emit("error") };
}

export function withLogger(): Mw {
    return (next) => async (ctx) => {
        ctx.log = makeLogger(ctx.requestId);
        return next(ctx);
    };
}
