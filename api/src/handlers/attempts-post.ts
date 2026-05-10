import {
    PostAttemptBody,
    apiError,
    err,
    type ApiError,
    type Result,
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
import type { RecordAttemptOutput } from "../core/use-cases";

export const postAttemptLogic: DomainHandler<RecordAttemptOutput> = async (ctx: Ctx) => {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
    const uc = useCases({ repos: ctx.repos, clock: ctx.clock, id: ctx.id });
    return uc.recordAttempt({
        sub: ctx.caller.sub,
        body: ctx.body as PostAttemptBody,
    }) as Promise<Result<RecordAttemptOutput, ApiError>>;
};

export const handler = compose<RecordAttemptOutput>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(prodRepos()),
    withAuth({ required: true }),
    withSchema(PostAttemptBody),
)(postAttemptLogic, {
    successStatus: (v) => ("duplicate" in v && v.duplicate ? 200 : 201),
});
