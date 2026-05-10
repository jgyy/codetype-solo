import type { ApiError, Result } from "@codetype/shared";
import type { ClockPort, DailyPort, DailySeedRow, SnippetRow } from "../ports";

export type GetDailyDeps = { daily: DailyPort; clock: ClockPort };
export type GetDailyInput = { date?: string };

function hashDate(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h | 0);
}

const pickByDate =
    (date: string) =>
    (snippets: SnippetRow[]): SnippetRow =>
        snippets[hashDate(date) % snippets.length]!;

export const getDailyChallenge =
    (d: GetDailyDeps) =>
    async (input: GetDailyInput): Promise<Result<DailySeedRow, ApiError>> => {
        const date = input.date ?? d.clock.now().toISOString().slice(0, 10);
        return d.daily.getOrSeed(date, pickByDate(date)) as Promise<Result<DailySeedRow, ApiError>>;
    };
