import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { ddb, TABLE } from "../lib/dynamo";
import { badRequest, json } from "../lib/auth";

const LANGS = new Set(["js", "py", "c", "go"]);

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const lang = event.pathParameters?.lang;
  const id = event.pathParameters?.id;
  if (!lang || !id) return badRequest("lang and id required");
  if (!LANGS.has(lang)) return badRequest("invalid language");

  const r = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `SNIPPET#${lang}`, SK: `SNIPPET#${id}` } }),
  );
  if (!r.Item) return json(404, { error: "not_found" });
  return json(200, r.Item);
}
