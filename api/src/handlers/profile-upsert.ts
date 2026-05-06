import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { ddb, TABLE } from "../lib/dynamo";
import { getCaller, json, unauthorized } from "../lib/auth";

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const caller = getCaller(event);
  if (!caller) return unauthorized();

  const item = {
    PK: `USER#${caller.sub}`,
    SK: "PROFILE",
    entity: "PROFILE" as const,
    email: caller.email ?? null,
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
    return json(201, { ok: true, created: true });
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") {
      return json(200, { ok: true, created: false });
    }
    throw err;
  }
}
