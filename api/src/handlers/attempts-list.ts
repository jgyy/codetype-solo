import {
    ListAttemptsQuery,
    apiError,
    err,
    isErr,
    ok,
    type ApiError,
    type Result,
} from "@codetype/shared";
import { httpAdapter, parseWith, type HandlerCtx } from "../lib/http";
import type { AttemptRow } from "../repos";

type ListResponse = { items: AttemptRow[] };

export async function listAttemptsLogic(
    ctx: HandlerCtx,
): Promise<Result<ListResponse, ApiError>> {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));

    const q = parseWith(ListAttemptsQuery, ctx.event.queryStringParameters ?? {});
    if (isErr(q)) return q;
    const from = q.value.from ?? "1970-01-01";
    const to = q.value.to ?? "9999-12-31";

    const r = await ctx.repos.attempts.listByUser(ctx.caller.sub, { from, to });
    if (isErr(r)) return r;
    return ok({ items: r.value });
}

export const handler = httpAdapter(listAttemptsLogic, { successStatus: 200 });
