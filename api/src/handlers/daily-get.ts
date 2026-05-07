import {
    DailyQuery,
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
import { composeRepos, type DailySeedRow, type SnippetRow } from "../repos";

function hashDate(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h | 0);
}

function pickByDate(date: string) {
    return (snippets: SnippetRow[]): SnippetRow => snippets[hashDate(date) % snippets.length]!;
}

export const getDailyLogic: DomainHandler<DailySeedRow> = async (ctx: Ctx) => {
    const q = ctx.body as { date?: string };
    const date = q.date ?? new Date().toISOString().slice(0, 10);
    return ctx.repos.daily.getOrSeed(date, pickByDate(date)) as Promise<Result<DailySeedRow, ApiError>>;
};

export const handler = compose<DailySeedRow>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(composeRepos()),
    withAuth({ required: false }),
    withSchema(DailyQuery, "query"),
)(getDailyLogic, { successStatus: 200 });
