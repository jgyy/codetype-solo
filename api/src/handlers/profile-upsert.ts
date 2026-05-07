import { apiError, err, isErr, type ApiError, type Result } from "@codetype/shared";
import { httpAdapter, type HandlerCtx } from "../lib/http";

type ProfileResponse = { created: boolean };

export async function upsertProfileLogic(
    ctx: HandlerCtx,
): Promise<Result<ProfileResponse, ApiError>> {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));

    const r = await ctx.repos.profiles.upsert(ctx.caller.sub, {
        email: ctx.caller.email ?? null,
    });
    if (isErr(r)) return r;
    return r;
}

export const handler = httpAdapter(upsertProfileLogic, {
    successStatus: (v) => (v.created ? 201 : 200),
});
