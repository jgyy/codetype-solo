import {
    GetLeaderboardQuery,
    type LeaderboardResponse,
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

export const getLeaderboardLogic: DomainHandler<LeaderboardResponse> = async (ctx: Ctx) => {
    const q = ctx.body as GetLeaderboardQuery;
    const uc = useCases({ repos: ctx.repos, clock: ctx.clock, id: ctx.id });
    return uc.getLeaderboard(q);
};

export const handler = compose<LeaderboardResponse>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(prodRepos()),
    withAuth({ required: false }),
    withSchema(GetLeaderboardQuery, "query"),
)(getLeaderboardLogic, { successStatus: 200 });
