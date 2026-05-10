import { NextSnippetQuery } from "@codetype/shared";
import { prodRepos, useCases } from "../composition";
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
import type { GetNextSnippetOutput } from "../core/use-cases";

export const getNextSnippetLogic: DomainHandler<GetNextSnippetOutput> = async (ctx: Ctx) => {
    const q = ctx.body as NextSnippetQuery;
    const uc = useCases({ repos: ctx.repos, clock: ctx.clock, id: ctx.id });
    return uc.getNextSnippet({
        sub: ctx.caller?.sub ?? null,
        lang: q.lang,
        mode: q.mode,
    });
};

export const handler = compose<GetNextSnippetOutput>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(prodRepos()),
    withAuth({ required: false }),
    withSchema(NextSnippetQuery, "query"),
)(getNextSnippetLogic, { successStatus: 200 });
