import {
    UpsertProfileBody,
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

type ProfileResponse = { created: boolean };

export const upsertProfileLogic: DomainHandler<ProfileResponse> = async (ctx: Ctx) => {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
    const r = await ctx.repos.profiles.upsert(ctx.caller.sub, {
        email: ctx.caller.email ?? null,
    });
    if (isErr(r)) return r as Result<never, ApiError>;
    return r;
};

export const handler = compose<ProfileResponse>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(composeRepos()),
    withAuth({ required: true }),
    withSchema(UpsertProfileBody),
)(upsertProfileLogic, {
    successStatus: (v) => (v.created ? 201 : 200),
});
