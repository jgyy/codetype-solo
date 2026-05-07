import { apiError, err } from "@codetype/shared";
import type { Mw } from "./types";

// Catches anything thrown deeper in the chain and converts to an internal error
// Result. The compose() outer adapter then serialises that to the wire envelope.
// Stack traces go to structured logs only — never to the response body.
export function withErrorEnvelope(): Mw {
    return (next) => async (ctx) => {
        try {
            return await next(ctx);
        } catch (e) {
            const meta = e instanceof Error
                ? { name: e.name, message: e.message, stack: e.stack }
                : { value: String(e) };
            ctx.log.error("unhandled_handler_error", meta);
            return err(apiError("internal", "internal_error"));
        }
    };
}
