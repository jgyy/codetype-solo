import { GetCommand, ScanCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { apiError, err, ok, type ApiError, type Language, type Result } from "@codetype/shared";
import { snippetPk, snippetSk } from "./keys";

export type SnippetRow = {
  PK: string;
  SK: string;
  entity: "SNIPPET";
  language: Language;
  title: string;
  code: string;
  difficulty: number;
};

export interface SnippetsRepo {
  get(lang: Language, id: string): Promise<Result<SnippetRow, ApiError>>;
  listAll(): Promise<Result<SnippetRow[], ApiError>>;
}

export function makeDdbSnippetsRepo(
  client: DynamoDBDocumentClient,
  table: string,
): SnippetsRepo {
  return {
    async get(lang, id) {
      const r = await client.send(
        new GetCommand({ TableName: table, Key: { PK: snippetPk(lang), SK: snippetSk(id) } }),
      );
      if (!r.Item) return err(apiError("not_found", "snippet not found"));
      return ok(r.Item as SnippetRow);
    },

    async listAll() {
      const out: SnippetRow[] = [];
      let ExclusiveStartKey: Record<string, unknown> | undefined;
      do {
        const r = await client.send(
          new ScanCommand({
            TableName: table,
            FilterExpression: "entity = :e",
            ExpressionAttributeValues: { ":e": "SNIPPET" },
            ExclusiveStartKey,
          }),
        );
        if (r.Items) out.push(...(r.Items as SnippetRow[]));
        ExclusiveStartKey = r.LastEvaluatedKey;
      } while (ExclusiveStartKey);
      return ok(out);
    },
  };
}

export function makeInMemorySnippetsRepo(seed: SnippetRow[] = []): SnippetsRepo {
  const items = new Map(seed.map((s) => [`${s.PK}|${s.SK}`, s]));
  return {
    async get(lang, id) {
      const it = items.get(`${snippetPk(lang)}|${snippetSk(id)}`);
      if (!it) return err(apiError("not_found", "snippet not found"));
      return ok(it);
    },
    async listAll() {
      return ok([...items.values()]);
    },
  };
}
