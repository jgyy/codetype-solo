import { makeLogger } from "../lib/logger";
import type { Mw } from "./types";

function deriveRoute(event: { requestContext?: { http?: { method?: string; path?: string }; routeKey?: string } }): string {
    const rc = event.requestContext;
    if (rc?.routeKey && rc.routeKey !== "$default") return rc.routeKey;
    const m = rc?.http?.method ?? "?";
    const p = rc?.http?.path ?? "?";
    return `${m} ${p}`;
}

export function withLogger(): Mw {
    return (next) => async (ctx) => {
        ctx.log = makeLogger({
            requestId: ctx.requestId,
            route: deriveRoute(ctx.event),
        });
        return next(ctx);
    };
}
