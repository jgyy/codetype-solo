import {
    GetCommand,
    PutCommand,
    ScanCommand,
    UpdateCommand,
    type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { apiError, err, ok, type ApiError, type Language, type Result } from "@codetype/shared";
import { snippetPk, snippetSk } from "./keys";

export type SnippetRow = {
    PK: string;
    SK: string;
    entity: "SNIPPET" | "SNIPPET_RETIRED";
    id?: string;
    language: Language;
    title: string;
    code: string;
    difficulty: number;
    submitter_sub?: string;
    created_at?: string;
};

export interface SnippetsRepo {
    get(lang: Language, id: string): Promise<Result<SnippetRow, ApiError>>;
    listAll(): Promise<Result<SnippetRow[], ApiError>>;
    put(row: SnippetRow): Promise<Result<void, ApiError>>;
    retract(lang: Language, id: string): Promise<Result<void, ApiError>>;
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
            const row = r.Item as SnippetRow;
            // Retired rows are invisible to the public read path.
            if (row.entity === "SNIPPET_RETIRED") {
                return err(apiError("not_found", "snippet not found"));
            }
            return ok(row);
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

        async put(row) {
            await client.send(new PutCommand({ TableName: table, Item: row }));
            return ok(undefined);
        },

        async retract(lang, id) {
            try {
                await client.send(
                    new UpdateCommand({
                        TableName: table,
                        Key: { PK: snippetPk(lang), SK: snippetSk(id) },
                        UpdateExpression: "SET #e = :retired",
                        ConditionExpression: "attribute_exists(PK) AND #e = :snippet",
                        ExpressionAttributeNames: { "#e": "entity" },
                        ExpressionAttributeValues: {
                            ":retired": "SNIPPET_RETIRED",
                            ":snippet": "SNIPPET",
                        },
                    }),
                );
                return ok(undefined);
            } catch (e) {
                if ((e as { name?: string }).name === "ConditionalCheckFailedException") {
                    return err(apiError("not_found", "snippet not found or already retired"));
                }
                throw e;
            }
        },
    };
}

export function makeInMemorySnippetsRepo(seed: SnippetRow[] = []): SnippetsRepo {
    const items = new Map<string, SnippetRow>(seed.map((s) => [`${s.PK}|${s.SK}`, s]));
    return {
        async get(lang, id) {
            const it = items.get(`${snippetPk(lang)}|${snippetSk(id)}`);
            if (!it || it.entity === "SNIPPET_RETIRED") {
                return err(apiError("not_found", "snippet not found"));
            }
            return ok(it);
        },
        async listAll() {
            return ok([...items.values()].filter((r) => r.entity === "SNIPPET"));
        },
        async put(row) {
            items.set(`${row.PK}|${row.SK}`, row);
            return ok(undefined);
        },
        async retract(lang, id) {
            const k = `${snippetPk(lang)}|${snippetSk(id)}`;
            const cur = items.get(k);
            if (!cur || cur.entity !== "SNIPPET") {
                return err(apiError("not_found", "snippet not found or already retired"));
            }
            items.set(k, { ...cur, entity: "SNIPPET_RETIRED" });
            return ok(undefined);
        },
    };
}
