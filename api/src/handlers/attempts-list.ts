import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { apiError, err, ok, type ApiError, type Result } from "@codetype/shared";
import { ddb, GSI1, TABLE } from "../lib/dynamo";
import { httpAdapter, type HandlerCtx } from "../lib/http";

type ListResponse = { items: Record<string, unknown>[] };

async function listAttempts(ctx: HandlerCtx): Promise<Result<ListResponse, ApiError>> {
  if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));

  const from = ctx.event.queryStringParameters?.from ?? "1970-01-01";
  const to = ctx.event.queryStringParameters?.to ?? "9999-12-31";

  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: GSI1,
      KeyConditionExpression: "GSI1PK = :pk AND GSI1SK BETWEEN :from AND :to",
      ExpressionAttributeValues: {
        ":pk": `USER#${ctx.caller.sub}`,
        ":from": `DATE#${from}`,
        ":to": `DATE#${to}~`,
      },
      ScanIndexForward: false,
      Limit: 200,
    }),
  );

  return ok({ items: (res.Items as Record<string, unknown>[]) ?? [] });
}

export const handler = httpAdapter(listAttempts, { successStatus: 200 });
