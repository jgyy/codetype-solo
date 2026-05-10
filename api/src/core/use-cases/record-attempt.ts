import {
    accuracyScaledWpm,
    analyse,
    analyseAttempt,
    grossWpm,
    isErr,
    mergeModel,
    netWpm,
    ok,
    type ApiError,
    type PostAttemptBody,
    type Result,
    type WpmInput,
} from "@codetype/shared";
import type { AttemptsPort, ClockPort, ProfilePort, SnippetsPort } from "../ports";

export type RecordAttemptDeps = {
    attempts: AttemptsPort;
    clock: ClockPort;
    // Optional: when present, attempt-record also folds the timeline into
    // the user's error model. Tests that don't care can omit them.
    profiles?: ProfilePort;
    snippets?: SnippetsPort;
};
export type RecordAttemptInput = { sub: string; body: PostAttemptBody };

export type RecordAttemptOutput =
    | {
          sk: string;
          wpm_mismatch: boolean;
          duplicate?: false;
          cheat_score?: number;
          cheat_reasons?: string[];
      }
    | { sk: string; duplicate: true };

async function updateErrorModel(
    d: RecordAttemptDeps,
    sub: string,
    body: PostAttemptBody,
): Promise<void> {
    if (!d.profiles || !d.snippets || !body.timeline) return;
    const sn = await d.snippets.get(body.language, body.snippet_id);
    if (isErr(sn)) return;
    const fresh = analyseAttempt({
        snippet: sn.value.code,
        language: body.language,
        timeline: body.timeline,
    });
    const profile = await d.profiles.get(sub);
    if (isErr(profile)) return;
    const merged = mergeModel(profile.value?.error_model, fresh, d.clock.now());
    await d.profiles.patch(sub, { error_model: merged });
}

export const recordAttempt =
    (d: RecordAttemptDeps) =>
    async (input: RecordAttemptInput): Promise<Result<RecordAttemptOutput, ApiError>> => {
        const body = input.body;
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

        const r = await d.attempts.put({
            sub: input.sub,
            clientAttemptId: body.client_attempt_id,
            snippetId: body.snippet_id,
            language: body.language,
            createdAt: d.clock.now().toISOString(),
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
            ...(cheatReport
                ? { cheatScore: cheatReport.score, cheatReasons: cheatReport.reasons }
                : {}),
        });
        if (isErr(r)) return r as Result<never, ApiError>;
        if (r.value.duplicate) return ok({ sk: r.value.sk, duplicate: true });

        // Best-effort error-model update. Spec 013: synchronous in v1.
        // Never fails the attempt — the leaderboard / streak are the
        // observable part, the model is opportunistic.
        if (d.profiles && d.snippets && body.timeline) {
            void updateErrorModel(d, input.sub, body).catch(() => {});
        }

        return ok({
            sk: r.value.sk,
            wpm_mismatch: mismatch,
            ...(cheatReport
                ? { cheat_score: cheatReport.score, cheat_reasons: cheatReport.reasons }
                : {}),
        });
    };
