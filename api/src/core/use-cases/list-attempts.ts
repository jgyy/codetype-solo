import { isErr, ok, type ApiError, type Result } from "@codetype/shared";
import type { AttemptRow, AttemptsPort } from "../ports";

export type ListAttemptsDeps = { attempts: AttemptsPort };
export type ListAttemptsInput = { sub: string; from?: string; to?: string };
export type ListAttemptsOutput = { items: AttemptRow[] };

export const listAttempts =
    (d: ListAttemptsDeps) =>
    async (input: ListAttemptsInput): Promise<Result<ListAttemptsOutput, ApiError>> => {
        const from = input.from ?? "1970-01-01";
        const to = input.to ?? "9999-12-31";
        const r = await d.attempts.listByUser(input.sub, { from, to });
        if (isErr(r)) return r as Result<never, ApiError>;
        return ok({ items: r.value });
    };
