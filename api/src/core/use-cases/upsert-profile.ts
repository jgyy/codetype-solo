import {
    apiError,
    err,
    handleIsBlocked,
    isErr,
    ok,
    type ApiError,
    type Result,
    type UpsertProfileBody,
} from "@codetype/shared";
import type { ClockPort, ProfilePort } from "../ports";

export type UpsertProfileDeps = { profiles: ProfilePort; clock: ClockPort };
export type UpsertProfileInput = {
    sub: string;
    email: string | null;
    body: UpsertProfileBody;
};
export type UpsertProfileOutput = {
    created: boolean;
    handle?: string;
    leaderboard_optin?: boolean;
    display_name?: string;
};

const HANDLE_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const upsertProfile =
    (d: UpsertProfileDeps) =>
    async (input: UpsertProfileInput): Promise<Result<UpsertProfileOutput, ApiError>> => {
        const { sub, email, body } = input;

        if (body.handle && handleIsBlocked(body.handle)) {
            return err(apiError("bad_request", "handle is not allowed"));
        }

        const upsertRes = await d.profiles.upsert(sub, { email });
        if (isErr(upsertRes)) return upsertRes as Result<never, ApiError>;
        const created = upsertRes.value.created;

        const hasPatch =
            body.handle !== undefined ||
            body.leaderboard_optin !== undefined ||
            body.display_name !== undefined;
        if (!hasPatch) return ok({ created });

        const nowMs = d.clock.now().getTime();
        if (body.handle !== undefined) {
            const cur = await d.profiles.get(sub);
            if (!cur.ok) return cur as Result<never, ApiError>;
            const existing = cur.value;
            if (
                existing?.handle &&
                existing.handle !== body.handle &&
                existing.handle_changed_at
            ) {
                const lastChange = Date.parse(existing.handle_changed_at);
                if (
                    !Number.isNaN(lastChange) &&
                    nowMs - lastChange < HANDLE_CHANGE_COOLDOWN_MS
                ) {
                    return err(apiError("rate_limited", "handle can only change once per 24h"));
                }
            }
        }

        const patchRes = await d.profiles.patch(sub, {
            ...(body.handle !== undefined
                ? { handle: body.handle, handle_changed_at: new Date(nowMs).toISOString() }
                : {}),
            ...(body.leaderboard_optin !== undefined
                ? { leaderboard_optin: body.leaderboard_optin }
                : {}),
            ...(body.display_name !== undefined ? { display_name: body.display_name } : {}),
        });
        if (isErr(patchRes)) return patchRes as Result<never, ApiError>;
        const row = patchRes.value;

        return ok({
            created,
            ...(row.handle !== undefined ? { handle: row.handle } : {}),
            ...(row.leaderboard_optin !== undefined
                ? { leaderboard_optin: row.leaderboard_optin }
                : {}),
            ...(row.display_name !== undefined ? { display_name: row.display_name } : {}),
        });
    };
