import { apiError, err } from "@codetype/shared";
import type { Mw } from "./types";

export function withErrorEnvelope(): Mw {
    return (next) => async (ctx) => {
        try {
            return await next(ctx);
        } catch (e) {
            ctx.log.error("unhandled_handler_error", e);
            return err(apiError("internal", "internal_error"));
        }
    };
}
