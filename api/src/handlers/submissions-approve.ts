import {
    SubmissionIdParam,
    apiError,
    err,
    isErr,
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

type Response = { snippetId: string };

export const approveSubmissionLogic: DomainHandler<Response> = async (ctx: Ctx) => {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
    const p = ctx.body as { id: string };
    return ctx.repos.submissions.approve(p.id, ctx.caller.sub) as Promise<
        Result<Response, ApiError>
    >;
};

export const handler = compose<Response>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(composeRepos()),
    withAuth({ required: true, group: "mods" }),
    withSchema(SubmissionIdParam, "path"),
)(approveSubmissionLogic, { successStatus: 200 });
