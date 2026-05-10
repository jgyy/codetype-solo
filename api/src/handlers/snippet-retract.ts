import {
    RetractParam,
    apiError,
    err,
    type Language,
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
import { prodRepos } from "../composition";

type Response = { retired: true };

export const retractSnippetLogic: DomainHandler<Response> = async (ctx: Ctx) => {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
    const p = ctx.body as { lang: Language; id: string };
    const uc = useCases({ repos: ctx.repos, clock: ctx.clock, id: ctx.id });
    return uc.retractSnippet(p);
};

export const handler = compose<Response>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(prodRepos()),
    withAuth({ required: true, group: "mods" }),
    withSchema(RetractParam, "path"),
)(retractSnippetLogic, { successStatus: 200 });
