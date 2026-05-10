import {
    SubmissionBody,
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
import { prodRepos } from "../composition";
import type { SubmitSnippetOutput } from "../core/use-cases";

export const submitSnippetLogic: DomainHandler<SubmitSnippetOutput> = async (ctx: Ctx) => {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
    const uc = useCases({ repos: ctx.repos, clock: ctx.clock, id: ctx.id });
    return uc.submitSnippet({ sub: ctx.caller.sub, body: ctx.body as SubmissionBody });
};

export const handler = compose<SubmitSnippetOutput>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(prodRepos()),
    withAuth({ required: true }),
    withSchema(SubmissionBody),
)(submitSnippetLogic, { successStatus: 201 });
