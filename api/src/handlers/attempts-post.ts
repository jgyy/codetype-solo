import { PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  accuracyScaledWpm,
  apiError,
  err,
  grossWpm,
  netWpm,
  ok,
  type ApiError,
  type Language,
  type Result,
  type WpmInput,
} from "@codetype/shared";
import { ddb, TABLE } from "../lib/dynamo";
import { httpAdapter, type HandlerCtx } from "../lib/http";

const LANGS = new Set<Language>(["js", "py", "c", "go"]);

type Body = {
  client_attempt_id: string;
  snippet_id: string;
  language: Language;
  wpm_gross: number;
  wpm_net: number;
  wpm_scaled: number;
  accuracy: number;
  errors: number;
  duration_ms: number;
  chars_total: number;
  chars_correct: number;
};

type AttemptResponse =
  | { sk: string; wpm_mismatch: boolean; duplicate?: false }
  | { duplicate: true };

async function postAttempt(ctx: HandlerCtx): Promise<Result<AttemptResponse, ApiError>> {
  if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));

  let body: Body;
  try {
    body = JSON.parse(ctx.event.body ?? "{}") as Body;
  } catch {
    return err(apiError("bad_request", "invalid json"));
  }

  const v = validate(body);
  if (v) return err(apiError("bad_request", v));

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

function validate(b: Body): string | null {
  if (!b.client_attempt_id || typeof b.client_attempt_id !== "string") return "client_attempt_id required";
  if (!b.snippet_id) return "snippet_id required";
  if (!LANGS.has(b.language)) return "invalid language";
  if (b.duration_ms <= 0) return "duration_ms must be > 0";
  if (b.chars_total <= 0) return "chars_total must be > 0";
  if (b.chars_correct < 0 || b.chars_correct > b.chars_total) return "chars_correct out of range";
  if (b.accuracy < 0 || b.accuracy > 1) return "accuracy out of range";
  if (b.errors < 0) return "errors must be >= 0";
  if (b.wpm_gross < 0 || b.wpm_net < 0 || b.wpm_scaled < 0) return "wpm must be >= 0";
  return null;
}
