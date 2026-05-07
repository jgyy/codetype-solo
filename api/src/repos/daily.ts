import { GetCommand, PutCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { apiError, err, ok, type ApiError, type Result } from "@codetype/shared";
import { dailyPk, dailySk } from "./keys";
import type { SnippetRow, SnippetsRepo } from "./snippets";

export type DailySeedRow = {
  PK: "DAILY";
  SK: string;
  entity: "DAILY";
  snippet_id: string;
  language: string;
};

export interface DailyRepo {
  getOrSeed(
    date: string,
    pickSnippet: (snippets: SnippetRow[]) => SnippetRow,
  ): Promise<Result<DailySeedRow, ApiError>>;
}

function toRow(date: string, snippet: SnippetRow): DailySeedRow {
  return {
    PK: "DAILY",
    SK: dailySk(date),
    entity: "DAILY",
    snippet_id: snippet.SK.replace("SNIPPET#", ""),
    language: snippet.language,
  };
}

export function makeDdbDailyRepo(
  client: DynamoDBDocumentClient,
  table: string,
  snippets: SnippetsRepo,
): DailyRepo {
  return {
    async getOrSeed(date, pick) {
      const existing = await client.send(
        new GetCommand({ TableName: table, Key: { PK: dailyPk(), SK: dailySk(date) } }),
      );
      if (existing.Item) return ok(existing.Item as DailySeedRow);

      const all = await snippets.listAll();
      if (!all.ok) return all;
      if (all.value.length === 0) return err(apiError("bad_request", "no snippets seeded"));

      const seed = toRow(date, pick(all.value));
      try {
        await client.send(
          new PutCommand({
            TableName: table,
            Item: seed,
            ConditionExpression: "attribute_not_exists(SK)",
          }),
        );
        return ok(seed);
      } catch (e) {
        if ((e as { name?: string }).name === "ConditionalCheckFailedException") {
          const re = await client.send(
            new GetCommand({ TableName: table, Key: { PK: dailyPk(), SK: dailySk(date) } }),
          );
          if (re.Item) return ok(re.Item as DailySeedRow);
        }
        throw e;
      }
    },
  };
}

export function makeInMemoryDailyRepo(snippets: SnippetsRepo): DailyRepo {
  const seeds = new Map<string, DailySeedRow>();
  return {
    async getOrSeed(date, pick) {
      const existing = seeds.get(date);
      if (existing) return ok(existing);
      const all = await snippets.listAll();
      if (!all.ok) return all;
      if (all.value.length === 0) return err(apiError("bad_request", "no snippets seeded"));
      const row = toRow(date, pick(all.value));
      seeds.set(date, row);
      return ok(row);
    },
  };
}
