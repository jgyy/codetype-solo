import {
    GetCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
    type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { apiError, err, ok, type ApiError, type Language, type Result } from "@codetype/shared";
import { GSI2 } from "./client";
import { snippetGsi2Pk, snippetGsi2Sk, snippetPk, snippetSk } from "./keys";

const LANGS: Language[] = ["js", "py", "c", "go"];

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
    GSI2PK?: string;
    GSI2SK?: string;
};

export interface SnippetsRepo {
    get(lang: Language, id: string): Promise<Result<SnippetRow, ApiError>>;
    listAll(): Promise<Result<SnippetRow[], ApiError>>;
    listByLanguage(lang: Language): Promise<Result<SnippetRow[], ApiError>>;
    put(row: SnippetRow): Promise<Result<void, ApiError>>;
    retract(lang: Language, id: string): Promise<Result<void, ApiError>>;
}

// Ensure new rows carry the GSI2 keys. Used by put() and approve flows.
export function withGsi2Keys(row: SnippetRow): SnippetRow {
    if (row.GSI2PK && row.GSI2SK) return row;
    if (row.entity !== "SNIPPET") return row; // retired rows shouldn't appear in lists
    const id = row.id ?? row.SK.replace(/^SNIPPET#/, "");
    return {
        ...row,
        GSI2PK: snippetGsi2Pk(row.language),
        GSI2SK: snippetGsi2Sk(id),
    };
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

        async listByLanguage(lang) {
            const out: SnippetRow[] = [];
            let ExclusiveStartKey: Record<string, unknown> | undefined;
            do {
                const r = await client.send(
                    new QueryCommand({
                        TableName: table,
                        IndexName: GSI2,
                        KeyConditionExpression: "GSI2PK = :pk",
                        ExpressionAttributeValues: { ":pk": snippetGsi2Pk(lang) },
                        ExclusiveStartKey,
                    }),
                );
                if (r.Items) out.push(...(r.Items as SnippetRow[]));
                ExclusiveStartKey = r.LastEvaluatedKey;
            } while (ExclusiveStartKey);
            // Sparse GSI2 only indexes entity = SNIPPET; retired rows are
            // dropped at write-time (entity flips, GSI2PK removed by retract()).
            return ok(out);
        },

        async listAll() {
            // Composed across the 4 supported languages — each underlying
            // QueryCommand targets a single partition on GSI2, so this is
            // O(snippets) RCU with no Scan tax.
            const out: SnippetRow[] = [];
            for (const lang of LANGS) {
                const r = await this.listByLanguage(lang);
                if (!r.ok) return r;
                out.push(...r.value);
            }
            return ok(out);
        },

        async put(row) {
            await client.send(new PutCommand({ TableName: table, Item: withGsi2Keys(row) }));
            return ok(undefined);
        },

        async retract(lang, id) {
            try {
                await client.send(
                    new UpdateCommand({
                        TableName: table,
                        Key: { PK: snippetPk(lang), SK: snippetSk(id) },
                        UpdateExpression:
                            "SET #e = :retired REMOVE #pk, #sk",
                        ConditionExpression: "attribute_exists(PK) AND #e = :snippet",
                        ExpressionAttributeNames: {
                            "#e": "entity",
                            "#pk": "GSI2PK",
                            "#sk": "GSI2SK",
                        },
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
    const items = new Map<string, SnippetRow>(
        seed.map((s) => [`${s.PK}|${s.SK}`, withGsi2Keys(s)]),
    );
    return {
        async get(lang, id) {
            const it = items.get(`${snippetPk(lang)}|${snippetSk(id)}`);
            if (!it || it.entity === "SNIPPET_RETIRED") {
                return err(apiError("not_found", "snippet not found"));
            }
            return ok(it);
        },
        async listByLanguage(lang) {
            const pk = snippetGsi2Pk(lang);
            return ok(
                [...items.values()].filter(
                    (r) => r.entity === "SNIPPET" && r.GSI2PK === pk,
                ),
            );
        },
        async listAll() {
            return ok([...items.values()].filter((r) => r.entity === "SNIPPET"));
        },
        async put(row) {
            const r = withGsi2Keys(row);
            items.set(`${r.PK}|${r.SK}`, r);
            return ok(undefined);
        },
        async retract(lang, id) {
            const k = `${snippetPk(lang)}|${snippetSk(id)}`;
            const cur = items.get(k);
            if (!cur || cur.entity !== "SNIPPET") {
                return err(apiError("not_found", "snippet not found or already retired"));
            }
            const { GSI2PK: _pk, GSI2SK: _sk, ...rest } = cur;
            items.set(k, { ...rest, entity: "SNIPPET_RETIRED" });
            return ok(undefined);
        },
    };
}
