import {
    UpsertProfileBody,
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
import type { UpsertProfileOutput } from "../core/use-cases";

export const upsertProfileLogic: DomainHandler<UpsertProfileOutput> = async (ctx: Ctx) => {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
    const uc = useCases({ repos: ctx.repos, clock: ctx.clock, id: ctx.id });
    return uc.upsertProfile({
        sub: ctx.caller.sub,
        email: ctx.caller.email ?? null,
        body: ctx.body as UpsertProfileBody,
    });
};

export const handler = compose<UpsertProfileOutput>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(prodRepos()),
    withAuth({ required: true }),
    withSchema(UpsertProfileBody),
)(upsertProfileLogic, {
    successStatus: (v) => (v.created ? 201 : 200),
});
