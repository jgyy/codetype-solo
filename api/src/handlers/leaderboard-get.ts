import {
    GetLeaderboardQuery,
    isoWeek,
    isErr,
    ok,
    type ApiError,
    type LeaderboardResponse,
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

export const getLeaderboardLogic: DomainHandler<LeaderboardResponse> = async (ctx: Ctx) => {
    const q = ctx.body as GetLeaderboardQuery;
    const week = q.week ?? isoWeek(new Date());
    const r = await ctx.repos.leaderboard.topN(q.lang, week, 50);
    if (isErr(r)) return r as Result<never, ApiError>;
    return ok({
        lang: q.lang,
        week,
        entries: r.value.map((e, i) => ({
            rank: i + 1,
            handle: e.handle,
            wpm_scaled: e.wpm_scaled,
            attempts: e.attempts_in_window,
        })),
    });
};

export const handler = compose<LeaderboardResponse>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(composeRepos()),
    withAuth({ required: false }),
    withSchema(GetLeaderboardQuery, "query"),
)(getLeaderboardLogic, { successStatus: 200 });
