import { apiError, err } from "@codetype/shared";
import { prodRepos, useCases } from "../composition";
import {
    compose,
    withAuth,
    withErrorEnvelope,
    withLogger,
    withRepos,
    withRequestId,
    type Ctx,
    type DomainHandler,
} from "../middleware";
import type { ErrorModelView } from "../core/use-cases";

export const getErrorModelLogic: DomainHandler<ErrorModelView> = async (ctx: Ctx) => {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
    const uc = useCases({ repos: ctx.repos, clock: ctx.clock, id: ctx.id });
    return uc.getErrorModel({ sub: ctx.caller.sub });
};

export const handler = compose<ErrorModelView>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(prodRepos()),
    withAuth({ required: true }),
)(getErrorModelLogic, { successStatus: 200 });
