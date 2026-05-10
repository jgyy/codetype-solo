import {
    ListAttemptsQuery,
    apiError,
    err,
} from "@codetype/shared";
import { useCases } from "../composition";
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
import { composeRepos } from "../repos";
import type { ListAttemptsOutput } from "../core/use-cases";

export const listAttemptsLogic: DomainHandler<ListAttemptsOutput> = async (ctx: Ctx) => {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
    const q = ctx.body as { from?: string; to?: string };
    const uc = useCases({ repos: ctx.repos, clock: ctx.clock, id: ctx.id });
    return uc.listAttempts({ sub: ctx.caller.sub, from: q.from, to: q.to });
};

export const handler = compose<ListAttemptsOutput>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(composeRepos()),
    withAuth({ required: true }),
    withSchema(ListAttemptsQuery, "query"),
)(listAttemptsLogic, { successStatus: 200 });
