import { DrillSnippetQuery, type Snippet } from "@codetype/shared";
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

export const getDrillLogic: DomainHandler<Snippet> = async (ctx: Ctx) => {
    const q = ctx.body as DrillSnippetQuery;
    const uc = useCases({ repos: ctx.repos, clock: ctx.clock, id: ctx.id });
    return uc.getDrillSnippet({
        sub: ctx.caller?.sub ?? null,
        lang: q.lang,
        class: q.class,
    });
};

export const handler = compose<Snippet>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(prodRepos()),
    withAuth({ required: false }),
    withSchema(DrillSnippetQuery, "query"),
)(getDrillLogic, { successStatus: 200 });
