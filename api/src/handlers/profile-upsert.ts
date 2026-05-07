import {
    UpsertProfileBody,
    apiError,
    err,
    handleIsBlocked,
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

type ProfileResponse = {
    created: boolean;
    handle?: string;
    leaderboard_optin?: boolean;
    display_name?: string;
};

const HANDLE_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const upsertProfileLogic: DomainHandler<ProfileResponse> = async (ctx: Ctx) => {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
    const body = ctx.body as UpsertProfileBody;

    if (body.handle && handleIsBlocked(body.handle)) {
        return err(apiError("bad_request", "handle is not allowed"));
    }

    const upsertRes = await ctx.repos.profiles.upsert(ctx.caller.sub, {
        email: ctx.caller.email ?? null,
    });
    if (isErr(upsertRes)) return upsertRes as Result<never, ApiError>;
    const created = upsertRes.value.created;

    const hasPatch =
        body.handle !== undefined ||
        body.leaderboard_optin !== undefined ||
        body.display_name !== undefined;
    if (!hasPatch) return ok({ created });

    if (body.handle !== undefined) {
        const cur = await ctx.repos.profiles.get(ctx.caller.sub);
        if (!cur.ok) return cur as Result<never, ApiError>;
        const existing = cur.value;
        if (existing?.handle && existing.handle !== body.handle && existing.handle_changed_at) {
            const lastChange = Date.parse(existing.handle_changed_at);
            if (!Number.isNaN(lastChange) && Date.now() - lastChange < HANDLE_CHANGE_COOLDOWN_MS) {
                return err(apiError("rate_limited", "handle can only change once per 24h"));
            }
        }
    }

    const patchRes = await ctx.repos.profiles.patch(ctx.caller.sub, {
        ...(body.handle !== undefined ? { handle: body.handle, handle_changed_at: new Date().toISOString() } : {}),
        ...(body.leaderboard_optin !== undefined ? { leaderboard_optin: body.leaderboard_optin } : {}),
        ...(body.display_name !== undefined ? { display_name: body.display_name } : {}),
    });
    if (isErr(patchRes)) return patchRes as Result<never, ApiError>;
    const row = patchRes.value;

    return ok({
        created,
        ...(row.handle !== undefined ? { handle: row.handle } : {}),
        ...(row.leaderboard_optin !== undefined ? { leaderboard_optin: row.leaderboard_optin } : {}),
        ...(row.display_name !== undefined ? { display_name: row.display_name } : {}),
    });
};

export const handler = compose<ProfileResponse>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(composeRepos()),
    withAuth({ required: true }),
    withSchema(UpsertProfileBody),
)(upsertProfileLogic, {
    successStatus: (v) => (v.created ? 201 : 200),
});
