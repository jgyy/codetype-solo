import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { apiError, err, ok, type ApiError, type Result } from "@codetype/shared";
import { ddb, TABLE } from "../lib/dynamo";
import { httpAdapter, type HandlerCtx } from "../lib/http";

type ProfileResponse = { created: boolean };

async function upsertProfile(
  ctx: HandlerCtx,
): Promise<Result<ProfileResponse, ApiError>> {
  if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));

  const item = {
    PK: `USER#${ctx.caller.sub}`,
    SK: "PROFILE",
    entity: "PROFILE" as const,
    email: ctx.caller.email ?? null,
    created_at: new Date().toISOString(),
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    return ok({ created: true });
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") {
      return ok({ created: false });
    }
    throw e;
  }
}

export const handler = httpAdapter(upsertProfile, {
  successStatus: (v) => (v.created ? 201 : 200),
});
