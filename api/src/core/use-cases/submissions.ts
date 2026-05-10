import {
    apiError,
    err,
    isErr,
    ok,
    type ApiError,
    type Result,
    type SubmissionBody,
    type SubmissionDto,
} from "@codetype/shared";
import type { SubmissionsPort } from "../ports";

export type SubmissionsDeps = { submissions: SubmissionsPort };

const DAILY_LIMIT = 5;

export type SubmitSnippetOutput = { id: string; created_at: string; status: "PENDING" };

export const submitSnippet =
    (d: SubmissionsDeps) =>
    async (input: {
        sub: string;
        body: SubmissionBody;
    }): Promise<Result<SubmitSnippetOutput, ApiError>> => {
        const countRes = await d.submissions.countLast24h(input.sub);
        if (isErr(countRes)) return countRes as Result<never, ApiError>;
        if (countRes.value >= DAILY_LIMIT) {
            return err(apiError("rate_limited", `at most ${DAILY_LIMIT} submissions per 24h`));
        }
        const r = await d.submissions.put({
            submitterSub: input.sub,
            language: input.body.language,
            title: input.body.title,
            code: input.body.code,
            difficulty: input.body.difficulty,
        });
        if (isErr(r)) return r as Result<never, ApiError>;
        return ok({ id: r.value.id, created_at: r.value.created_at, status: "PENDING" });
    };

export type ListSubmissionsInput =
    | { mode: "mine"; sub: string }
    | { mode: "pending" };
export type ListSubmissionsOutput = { items: SubmissionDto[] };

export const listSubmissions =
    (d: SubmissionsDeps) =>
    async (input: ListSubmissionsInput): Promise<Result<ListSubmissionsOutput, ApiError>> => {
        const r =
            input.mode === "mine"
                ? await d.submissions.listByUser(input.sub)
                : await d.submissions.listPending();
        if (isErr(r)) return r as Result<never, ApiError>;
        return ok({ items: r.value });
    };

export const approveSubmission =
    (d: SubmissionsDeps) =>
    (input: { id: string; modSub: string }): Promise<Result<{ snippetId: string }, ApiError>> =>
        d.submissions.approve(input.id, input.modSub) as Promise<
            Result<{ snippetId: string }, ApiError>
        >;

export const rejectSubmission =
    (d: SubmissionsDeps) =>
    async (input: {
        id: string;
        modSub: string;
        reason: string;
    }): Promise<Result<{ ok: true }, ApiError>> => {
        const r = await d.submissions.reject(input.id, input.modSub, input.reason);
        if (isErr(r)) return r as Result<never, ApiError>;
        return ok({ ok: true });
    };
