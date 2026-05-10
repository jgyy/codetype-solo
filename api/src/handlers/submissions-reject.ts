import {
    RejectBody,
    SubmissionIdParam,
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

type Response = { ok: true };

export const rejectSubmissionLogic: DomainHandler<Response> = async (ctx: Ctx) => {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
    const body = ctx.body as { reason: string };
    const pathRes = SubmissionIdParam.safeParse(ctx.event.pathParameters ?? {});
    if (!pathRes.success) {
        return err(apiError("bad_request", "validation_failed", pathRes.error.issues));
    }
    const uc = useCases({ repos: ctx.repos, clock: ctx.clock, id: ctx.id });
    return uc.rejectSubmission({
        id: pathRes.data.id,
        modSub: ctx.caller.sub,
        reason: body.reason,
    });
};

export const handler = compose<Response>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(prodRepos()),
    withAuth({ required: true, group: "mods" }),
    withSchema(RejectBody),
)(rejectSubmissionLogic, { successStatus: 200 });
