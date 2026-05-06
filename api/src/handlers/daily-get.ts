import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { ddb, TABLE } from "../lib/dynamo";
import { badRequest, json } from "../lib/auth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const date = event.queryStringParameters?.date ?? new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(date)) return badRequest("invalid date");

  const existing = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: "DAILY", SK: `DATE#${date}` } }),
  );
  if (existing.Item) return json(200, existing.Item);

  // Self-seed deterministically.
  const snippets = await listSnippets();
  if (snippets.length === 0) return badRequest("no snippets seeded");
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
    return json(200, seed);
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") {
      const re = await ddb.send(
        new GetCommand({ TableName: TABLE, Key: { PK: "DAILY", SK: `DATE#${date}` } }),
      );
      if (re.Item) return json(200, re.Item);
    }
    throw err;
  }
  return json(500, { error: "seed_failed" });
}

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
