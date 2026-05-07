import { PutCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { ok, type ApiError, type Result } from "@codetype/shared";
import { profileSk, userPk } from "./keys";

export type ProfilePatch = { email: string | null };

export interface ProfileRepo {
  upsert(sub: string, patch: ProfilePatch): Promise<Result<{ created: boolean }, ApiError>>;
}

export function makeDdbProfileRepo(
  client: DynamoDBDocumentClient,
  table: string,
): ProfileRepo {
  return {
    async upsert(sub, patch) {
      try {
        await client.send(
          new PutCommand({
            TableName: table,
            Item: {
              PK: userPk(sub),
              SK: profileSk(),
              entity: "PROFILE",
              email: patch.email,
              created_at: new Date().toISOString(),
            },
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
    },
  };
}

export function makeInMemoryProfileRepo(): ProfileRepo {
  const subs = new Set<string>();
  return {
    async upsert(sub) {
      if (subs.has(sub)) return ok({ created: false });
      subs.add(sub);
      return ok({ created: true });
    },
  };
}
