import { PutCommand } from "@aws-sdk/lib-dynamodb";
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
import { ddb, TABLE } from "../lib/dynamo";
import { httpAdapter, parseJsonBody, type HandlerCtx } from "../lib/http";

type AttemptResponse =
  | { sk: string; wpm_mismatch: boolean; duplicate?: false }
  | { duplicate: true };

async function postAttempt(ctx: HandlerCtx): Promise<Result<AttemptResponse, ApiError>> {
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

  const createdAt = new Date().toISOString();
  const date = createdAt.slice(0, 10);
  const sk = `ATTEMPT#${createdAt}#${body.client_attempt_id.slice(0, 6)}`;
  const item = {
    PK: `USER#${ctx.caller.sub}`,
    SK: sk,
    GSI1PK: `USER#${ctx.caller.sub}`,
    GSI1SK: `DATE#${date}#${createdAt}`,
    entity: "ATTEMPT" as const,
    snippet_id: body.snippet_id,
    language: body.language,
    wpm_gross: serverGross,
    wpm_net: serverNet,
    wpm_scaled: serverScaled,
    accuracy: body.accuracy,
    errors: body.errors,
    duration_ms: body.duration_ms,
    chars_total: body.chars_total,
    chars_correct: body.chars_correct,
    created_at: createdAt,
    ...(mismatch ? { wpm_mismatch: true } : {}),
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      }),
    );
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") {
      return ok({ duplicate: true });
    }
    throw e;
  }

  return ok({ sk, wpm_mismatch: mismatch });
}

export const handler = httpAdapter(postAttempt, {
  successStatus: (v) => ("duplicate" in v && v.duplicate ? 200 : 201),
});
