import { randomUUID } from "node:crypto";
import type { Mw } from "./types";

export function withRequestId(): Mw {
    return (next) => async (ctx) => {
        const fromHeader =
            ctx.event.headers?.["x-request-id"] ?? ctx.event.headers?.["X-Request-Id"];
        const fromCtx = ctx.event.requestContext?.requestId;
        ctx.requestId = fromHeader ?? fromCtx ?? randomUUID();
        return next(ctx);
    };
}
