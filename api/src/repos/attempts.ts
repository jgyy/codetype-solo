import { PutCommand, QueryCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { ok, type ApiError, type Language, type Result } from "@codetype/shared";
import { GSI1 } from "./client";
import { attemptSk, dateGsi1Sk, userPk } from "./keys";

export type NewAttempt = {
  sub: string;
  clientAttemptId: string;
  snippetId: string;
  language: Language;
  createdAt: string; // ISO
  wpmGross: number;
  wpmNet: number;
  wpmScaled: number;
  accuracy: number;
  errors: number;
  durationMs: number;
  charsTotal: number;
  charsCorrect: number;
  wpmMismatch: boolean;
};

export type AttemptRow = Record<string, unknown>;

export interface AttemptsRepo {
  put(a: NewAttempt): Promise<Result<{ duplicate: boolean; sk: string }, ApiError>>;
  listByUser(
    sub: string,
    range: { from: string; to: string },
  ): Promise<Result<AttemptRow[], ApiError>>;
}

export function makeDdbAttemptsRepo(client: DynamoDBDocumentClient, table: string): AttemptsRepo {
  return {
    async put(a) {
      const sk = attemptSk(a.createdAt, a.clientAttemptId);
      const item: Record<string, unknown> = {
        PK: userPk(a.sub),
        SK: sk,
        GSI1PK: userPk(a.sub),
        GSI1SK: dateGsi1Sk(a.createdAt),
        entity: "ATTEMPT",
        snippet_id: a.snippetId,
        language: a.language,
        wpm_gross: a.wpmGross,
        wpm_net: a.wpmNet,
        wpm_scaled: a.wpmScaled,
        accuracy: a.accuracy,
        errors: a.errors,
        duration_ms: a.durationMs,
        chars_total: a.charsTotal,
        chars_correct: a.charsCorrect,
        created_at: a.createdAt,
        ...(a.wpmMismatch ? { wpm_mismatch: true } : {}),
      };
      try {
        await client.send(
          new PutCommand({
            TableName: table,
            Item: item,
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          }),
        );
        return ok({ duplicate: false, sk });
      } catch (e) {
        if ((e as { name?: string }).name === "ConditionalCheckFailedException") {
          return ok({ duplicate: true, sk });
        }
        throw e;
      }
    },

    async listByUser(sub, { from, to }) {
      const res = await client.send(
        new QueryCommand({
          TableName: table,
          IndexName: GSI1,
          KeyConditionExpression: "GSI1PK = :pk AND GSI1SK BETWEEN :from AND :to",
          ExpressionAttributeValues: {
            ":pk": userPk(sub),
            ":from": `DATE#${from}`,
            ":to": `DATE#${to}~`,
          },
          ScanIndexForward: false,
          Limit: 200,
        }),
      );
      return ok((res.Items as AttemptRow[]) ?? []);
    },
  };
}

// Test double — keeps the same observable contract.
export function makeInMemoryAttemptsRepo(): AttemptsRepo {
  const items: Record<string, AttemptRow> = {};

  return {
    async put(a) {
      const sk = attemptSk(a.createdAt, a.clientAttemptId);
      const key = `${userPk(a.sub)}|${sk}`;
      if (items[key]) return ok({ duplicate: true, sk });
      items[key] = {
        PK: userPk(a.sub),
        SK: sk,
        GSI1PK: userPk(a.sub),
        GSI1SK: dateGsi1Sk(a.createdAt),
        entity: "ATTEMPT",
        snippet_id: a.snippetId,
        language: a.language,
        wpm_gross: a.wpmGross,
        wpm_net: a.wpmNet,
        wpm_scaled: a.wpmScaled,
        accuracy: a.accuracy,
        errors: a.errors,
        duration_ms: a.durationMs,
        chars_total: a.charsTotal,
        chars_correct: a.charsCorrect,
        created_at: a.createdAt,
        ...(a.wpmMismatch ? { wpm_mismatch: true } : {}),
      };
      return ok({ duplicate: false, sk });
    },

    async listByUser(sub, { from, to }) {
      const pk = userPk(sub);
      const fromKey = `DATE#${from}`;
      const toKey = `DATE#${to}~`;
      const matches = Object.values(items).filter((it) => {
        if (it.GSI1PK !== pk) return false;
        const s = it.GSI1SK as string;
        return s >= fromKey && s <= toKey;
      });
      // ScanIndexForward: false → descending by GSI1SK
      matches.sort((a, b) => String(b.GSI1SK).localeCompare(String(a.GSI1SK)));
      return ok(matches.slice(0, 200));
    },
  };
}
