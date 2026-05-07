import {
    DailyQuery,
    isErr,
    type ApiError,
    type Result,
} from "@codetype/shared";
import { httpAdapter, parseWith, type HandlerCtx } from "../lib/http";
import type { DailySeedRow, SnippetRow } from "../repos";

function hashDate(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h | 0);
}

function pickByDate(date: string) {
    return (snippets: SnippetRow[]): SnippetRow => {
        const idx = hashDate(date) % snippets.length;
        return snippets[idx]!;
    };
}

export async function getDailyLogic(
    ctx: HandlerCtx,
): Promise<Result<DailySeedRow, ApiError>> {
    const q = parseWith(DailyQuery, ctx.event.queryStringParameters ?? {});
    if (isErr(q)) return q;
    const date = q.value.date ?? new Date().toISOString().slice(0, 10);
    return ctx.repos.daily.getOrSeed(date, pickByDate(date));
}

export const handler = httpAdapter(getDailyLogic, { successStatus: 200 });
