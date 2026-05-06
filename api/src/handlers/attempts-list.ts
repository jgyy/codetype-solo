import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { ddb, GSI1, TABLE } from "../lib/dynamo";
import { getCaller, json, unauthorized } from "../lib/auth";

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const caller = getCaller(event);
  if (!caller) return unauthorized();

  const from = event.queryStringParameters?.from ?? "1970-01-01";
  const to = event.queryStringParameters?.to ?? "9999-12-31";

  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: GSI1,
      KeyConditionExpression: "GSI1PK = :pk AND GSI1SK BETWEEN :from AND :to",
      ExpressionAttributeValues: {
        ":pk": `USER#${caller.sub}`,
        ":from": `DATE#${from}`,
        ":to": `DATE#${to}~`,
      },
      ScanIndexForward: false,
      Limit: 200,
    }),
  );

  return json(200, { items: res.Items ?? [] });
}
