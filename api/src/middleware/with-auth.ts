import { apiError, err } from "@codetype/shared";
import { getCaller } from "../lib/auth";
import type { Mw } from "./types";

export function withAuth(options: { required: boolean } = { required: true }): Mw {
    return (next) => async (ctx) => {
        ctx.caller = getCaller(ctx.event);
        if (options.required && !ctx.caller) {
            return err(apiError("unauthorized", "missing caller"));
        }
        return next(ctx);
    };
}
