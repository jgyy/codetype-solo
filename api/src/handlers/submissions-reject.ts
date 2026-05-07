import {
    RejectBody,
    SubmissionIdParam,
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

type Response = { ok: true };

export const rejectSubmissionLogic: DomainHandler<Response> = async (ctx: Ctx) => {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
    const body = ctx.body as { reason: string };

    const pathRes = SubmissionIdParam.safeParse(ctx.event.pathParameters ?? {});
    if (!pathRes.success) {
        return err(apiError("bad_request", "validation_failed", pathRes.error.issues));
    }
    const r = await ctx.repos.submissions.reject(pathRes.data.id, ctx.caller.sub, body.reason);
    if (isErr(r)) return r as Result<never, ApiError>;
    return ok({ ok: true });
};

export const handler = compose<Response>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(composeRepos()),
    withAuth({ required: true, group: "mods" }),
    withSchema(RejectBody),
)(rejectSubmissionLogic, { successStatus: 200 });
