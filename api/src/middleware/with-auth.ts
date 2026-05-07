import { apiError, err } from "@codetype/shared";
import { callerInGroup, getCaller } from "../lib/auth";
import type { Mw } from "./types";

export type AuthOptions = { required: boolean; group?: string };

export function withAuth(options: AuthOptions = { required: true }): Mw {
    return (next) => async (ctx) => {
        ctx.caller = getCaller(ctx.event);
        if (options.required && !ctx.caller) {
            return err(apiError("unauthorized", "missing caller"));
        }
        if (options.group && !callerInGroup(ctx.caller, options.group)) {
            return err(
                apiError("unauthorized", `caller not in group ${options.group}`, {
                    requiredGroup: options.group,
                }),
            );
        }
        return next(ctx);
    };
}
