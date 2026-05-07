import {
    CHEAT_THRESHOLD,
    PostAttemptBody,
    accuracyScaledWpm,
    analyse,
    apiError,
    err,
    grossWpm,
    isErr,
    netWpm,
    ok,
    type ApiError,
    type Result,
    type WpmInput,
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
import { syncLeaderboardForUser } from "../lib/lb-sync";

type AttemptResponse =
    | {
          sk: string;
          wpm_mismatch: boolean;
          duplicate?: false;
          leaderboard_updated?: boolean;
          cheat_score?: number;
          cheat_reasons?: string[];
      }
    | { sk: string; duplicate: true };

export const postAttemptLogic: DomainHandler<AttemptResponse> = async (ctx: Ctx) => {
    if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
    const body = ctx.body as PostAttemptBody;

    const wpmInput: WpmInput = {
        charsTotal: body.chars_total,
        charsCorrect: body.chars_correct,
        errors: body.errors,
        durationMs: body.duration_ms,
    };
    const serverGross = grossWpm(wpmInput);
    const serverNet = netWpm(wpmInput);
    const serverScaled = accuracyScaledWpm(wpmInput);
    const mismatch =
        Math.abs(serverGross - body.wpm_gross) > 1 ||
        Math.abs(serverNet - body.wpm_net) > 1 ||
        Math.abs(serverScaled - body.wpm_scaled) > 1;

    const cheatReport = body.timeline
        ? analyse(body.timeline, {
              chars: body.chars_total,
              errors: body.errors,
              durationMs: body.duration_ms,
          })
        : null;

    const r = await ctx.repos.attempts.put({
        sub: ctx.caller.sub,
        clientAttemptId: body.client_attempt_id,
        snippetId: body.snippet_id,
        language: body.language,
        createdAt: new Date().toISOString(),
        wpmGross: serverGross,
        wpmNet: serverNet,
        wpmScaled: serverScaled,
        accuracy: body.accuracy,
        errors: body.errors,
        durationMs: body.duration_ms,
        charsTotal: body.chars_total,
        charsCorrect: body.chars_correct,
        wpmMismatch: mismatch,
        ...(body.timeline ? { timeline: body.timeline } : {}),
        ...(cheatReport ? { cheatScore: cheatReport.score, cheatReasons: cheatReport.reasons } : {}),
    });
    if (isErr(r)) return r as Result<never, ApiError>;
    if (r.value.duplicate) return ok({ sk: r.value.sk, duplicate: true });

    let lbUpdated = false;
    const cheatBlocksLb = cheatReport !== null && cheatReport.score >= CHEAT_THRESHOLD;
    if (!cheatBlocksLb) {
        try {
            const sync = await syncLeaderboardForUser(ctx.repos, ctx.caller.sub, body.language);
            lbUpdated = sync.kind === "updated";
        } catch (e) {
            ctx.log.warn("lb_sync_failed", {
                err: e instanceof Error ? e.message : String(e),
                sub: ctx.caller.sub,
            });
        }
    }

    return ok({
        sk: r.value.sk,
        wpm_mismatch: mismatch,
        leaderboard_updated: lbUpdated,
        ...(cheatReport ? { cheat_score: cheatReport.score, cheat_reasons: cheatReport.reasons } : {}),
    });
};

export const handler = compose<AttemptResponse>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(composeRepos()),
    withAuth({ required: true }),
    withSchema(PostAttemptBody),
)(postAttemptLogic, {
    successStatus: (v) => ("duplicate" in v && v.duplicate ? 200 : 201),
});
