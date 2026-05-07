import {
    RetractParam,
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
import { composeRepos } from "../repos";

type Response = { retired: true };

export const retractSnippetLogic: DomainHandler<Response> = async (ctx: Ctx) => {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
    const p = ctx.body as { lang: import("@codetype/shared").Language; id: string };
    const r = await ctx.repos.snippets.retract(p.lang, p.id);
    if (isErr(r)) return r as Result<never, ApiError>;
    return ok({ retired: true });
};

export const handler = compose<Response>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(composeRepos()),
    withAuth({ required: true, group: "mods" }),
    withSchema(RetractParam, "path"),
)(retractSnippetLogic, { successStatus: 200 });
