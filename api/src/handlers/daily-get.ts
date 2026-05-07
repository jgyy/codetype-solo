import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import {
  DailyQuery,
  apiError,
  err,
  isErr,
  ok,
  type ApiError,
  type Result,
} from "@codetype/shared";
import { ddb, TABLE } from "../lib/dynamo";
import { httpAdapter, parseWith, type HandlerCtx } from "../lib/http";

async function getDaily(ctx: HandlerCtx): Promise<Result<Record<string, unknown>, ApiError>> {
  const q = parseWith(DailyQuery, ctx.event.queryStringParameters ?? {});
  if (isErr(q)) return q;
  const date = q.value.date ?? new Date().toISOString().slice(0, 10);

  const existing = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: "DAILY", SK: `DATE#${date}` } }),
  );
  if (existing.Item) return ok(existing.Item as Record<string, unknown>);

  const snippets = await listSnippets();
  if (snippets.length === 0) return err(apiError("bad_request", "no snippets seeded"));
  const idx = hashDate(date) % snippets.length;
  const chosen = snippets[idx]!;
  const seed = {
    PK: "DAILY",
    SK: `DATE#${date}`,
    entity: "DAILY" as const,
    snippet_id: chosen.SK.replace("SNIPPET#", ""),
    language: chosen.language,
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: seed,
        ConditionExpression: "attribute_not_exists(SK)",
      }),
    );
    return ok(seed);
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") {
      const re = await ddb.send(
        new GetCommand({ TableName: TABLE, Key: { PK: "DAILY", SK: `DATE#${date}` } }),
      );
      if (re.Item) return ok(re.Item as Record<string, unknown>);
    }
    throw e;
  }
  return err(apiError("internal", "seed_failed"));
}

export const handler = httpAdapter(getDaily, { successStatus: 200 });

type SnippetRow = { SK: string; language: string };

async function listSnippets(): Promise<SnippetRow[]> {
  const out: SnippetRow[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "entity = :e",
        ExpressionAttributeValues: { ":e": "SNIPPET" },
        ProjectionExpression: "SK, #lang",
        ExpressionAttributeNames: { "#lang": "language" },
        ExclusiveStartKey,
      }),
    );
    if (r.Items) out.push(...(r.Items as SnippetRow[]));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

function hashDate(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0);
}
