import {
    GetSnippetParams,
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
import { composeRepos, type SnippetRow } from "../repos";

export const getSnippetLogic: DomainHandler<SnippetRow> = async (ctx: Ctx) => {
    const p = ctx.body as GetSnippetParams;
    return ctx.repos.snippets.get(p.lang, p.id) as Promise<Result<SnippetRow, ApiError>>;
};

export const handler = compose<SnippetRow>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(composeRepos()),
    withAuth({ required: false }),
    withSchema(GetSnippetParams, "path"),
)(getSnippetLogic, { successStatus: 200 });
