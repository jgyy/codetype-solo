import {
  PostAttemptBody,
  accuracyScaledWpm,
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
import { httpAdapter, parseJsonBody, type HandlerCtx } from "../lib/http";

type AttemptResponse =
  | { sk: string; wpm_mismatch: boolean; duplicate?: false }
  | { sk: string; duplicate: true };

export async function postAttemptLogic(
  ctx: HandlerCtx,
): Promise<Result<AttemptResponse, ApiError>> {
  if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));

  const parsed = parseJsonBody(PostAttemptBody, ctx.event.body);
  if (isErr(parsed)) return parsed;
  const body = parsed.value;

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
  });
  if (isErr(r)) return r;

  if (r.value.duplicate) return ok({ sk: r.value.sk, duplicate: true });
  return ok({ sk: r.value.sk, wpm_mismatch: mismatch });
}

export const handler = httpAdapter(postAttemptLogic, {
  successStatus: (v) => ("duplicate" in v && v.duplicate ? 200 : 201),
});
