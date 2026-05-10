import { GetSnippetParams } from "@codetype/shared";
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
import { prodRepos, type SnippetRow } from "../composition";

export const getSnippetLogic: DomainHandler<SnippetRow> = async (ctx: Ctx) => {
    const p = ctx.body as GetSnippetParams;
    const uc = useCases({ repos: ctx.repos, clock: ctx.clock, id: ctx.id });
    return uc.getSnippet(p);
};

export const handler = compose<SnippetRow>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(prodRepos()),
    withAuth({ required: false }),
    withSchema(GetSnippetParams, "path"),
)(getSnippetLogic, { successStatus: 200 });
