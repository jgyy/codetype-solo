import {
    DailyQuery,
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
import { prodRepos, type DailySeedRow } from "../composition";

export const getDailyLogic: DomainHandler<DailySeedRow> = async (ctx: Ctx) => {
    const q = ctx.body as { date?: string };
    const uc = useCases({ repos: ctx.repos, clock: ctx.clock, id: ctx.id });
    return uc.getDailyChallenge({ date: q.date });
};

export const handler = compose<DailySeedRow>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(prodRepos()),
    withAuth({ required: false }),
    withSchema(DailyQuery, "query"),
)(getDailyLogic, { successStatus: 200 });
