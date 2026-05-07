import {
    ListAttemptsQuery,
    apiError,
    err,
    isErr,
    ok,
    type ApiError,
    type Result,
} from "@codetype/shared";
import {
    compose,
    withAuth,
    withErrorEnvelope,
    withLogger,
    withRepos,
    withRequestId,
    withSchema,
    type Ctx,
    type DomainHandler,
} from "../middleware";
import { composeRepos, type AttemptRow } from "../repos";

type ListResponse = { items: AttemptRow[] };

export const listAttemptsLogic: DomainHandler<ListResponse> = async (ctx: Ctx) => {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
    const q = ctx.body as { from?: string; to?: string };
    const from = q.from ?? "1970-01-01";
    const to = q.to ?? "9999-12-31";

    const r = await ctx.repos.attempts.listByUser(ctx.caller.sub, { from, to });
    if (isErr(r)) return r as Result<never, ApiError>;
    return ok({ items: r.value });
};

export const handler = compose<ListResponse>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(composeRepos()),
    withAuth({ required: true }),
    withSchema(ListAttemptsQuery, "query"),
)(listAttemptsLogic, { successStatus: 200 });
