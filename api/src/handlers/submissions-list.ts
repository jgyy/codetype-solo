import {
    ListSubmissionsQuery,
    apiError,
    err,
    isErr,
    ok,
    type ApiError,
    type Result,
    type SubmissionDto,
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
import { callerInGroup } from "../lib/auth";
import { composeRepos } from "../repos";

type Response = { items: SubmissionDto[] };

export const listSubmissionsLogic: DomainHandler<Response> = async (ctx: Ctx) => {
    const q = ctx.body as { mine?: string; status?: string };

    if (q.mine === "true") {
        if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
        const r = await ctx.repos.submissions.listByUser(ctx.caller.sub);
        if (isErr(r)) return r as Result<never, ApiError>;
        return ok({ items: r.value });
    }

    if (q.status) {
        if (!callerInGroup(ctx.caller, "mods")) {
            return err(apiError("unauthorized", "moderator role required"));
        }
        if (q.status !== "PENDING") {
            return err(
                apiError("bad_request", "only PENDING listing is supported via this endpoint"),
            );
        }
        const r = await ctx.repos.submissions.listPending();
        if (isErr(r)) return r as Result<never, ApiError>;
        return ok({ items: r.value });
    }

    return err(apiError("bad_request", "specify ?mine=true or ?status=PENDING"));
};

export const handler = compose<Response>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(composeRepos()),
    withAuth({ required: true }),
    withSchema(ListSubmissionsQuery, "query"),
)(listSubmissionsLogic, { successStatus: 200 });
