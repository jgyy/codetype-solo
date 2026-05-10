import {
    isErr,
    isoWeek,
    ok,
    type ApiError,
    type GetLeaderboardQuery,
    type LeaderboardResponse,
    type Result,
} from "@codetype/shared";
import type { ClockPort, LeaderboardPort } from "../ports";

export type GetLeaderboardDeps = { leaderboard: LeaderboardPort; clock: ClockPort };

export const getLeaderboard =
    (d: GetLeaderboardDeps) =>
    async (input: GetLeaderboardQuery): Promise<Result<LeaderboardResponse, ApiError>> => {
        const week = input.week ?? isoWeek(d.clock.now());
        const r = await d.leaderboard.topN(input.lang, week, 50);
        if (isErr(r)) return r as Result<never, ApiError>;
        return ok({
            lang: input.lang,
            week,
            entries: r.value.map((e, i) => ({
                rank: i + 1,
                handle: e.handle,
                wpm_scaled: e.wpm_scaled,
                attempts: e.attempts_in_window,
            })),
        });
    };
