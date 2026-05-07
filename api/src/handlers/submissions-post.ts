import {
    SubmissionBody,
    apiError,
    err,
    isErr,
    ok,
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
import { composeRepos } from "../repos";

const DAILY_LIMIT = 5;

type Response = { id: string; created_at: string; status: "PENDING" };

export const submitSnippetLogic: DomainHandler<Response> = async (ctx: Ctx) => {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
    const body = ctx.body as SubmissionBody;

    const countRes = await ctx.repos.submissions.countLast24h(ctx.caller.sub);
    if (isErr(countRes)) return countRes as Result<never, ApiError>;
    if (countRes.value >= DAILY_LIMIT) {
        return err(
            apiError("rate_limited", `at most ${DAILY_LIMIT} submissions per 24h`),
        );
    }

    const r = await ctx.repos.submissions.put({
        submitterSub: ctx.caller.sub,
        language: body.language,
        title: body.title,
        code: body.code,
        difficulty: body.difficulty,
    });
    if (isErr(r)) return r as Result<never, ApiError>;
    return ok({ id: r.value.id, created_at: r.value.created_at, status: "PENDING" });
};

export const handler = compose<Response>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(composeRepos()),
    withAuth({ required: true }),
    withSchema(SubmissionBody),
)(submitSnippetLogic, { successStatus: 201 });
