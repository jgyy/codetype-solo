import { randomUUID } from "node:crypto";
import {
    PutCommand,
    QueryCommand,
    TransactWriteCommand,
    type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import {
    apiError,
    err,
    ok,
    type ApiError,
    type Language,
    type Result,
    type SubmissionDto,
    type SubmissionStatus,
} from "@codetype/shared";
import { GSI1 } from "./client";
import {
    snippetGsi2Pk,
    snippetGsi2Sk,
    snippetPk,
    snippetSk,
    submissionStatusSk,
    submissionUserGsi1Sk,
    submissionsPk,
    userPk,
} from "./keys";
import type { SnippetsRepo } from "./snippets";

export type NewSubmission = {
    submitterSub: string;
    language: Language;
    title: string;
    code: string;
    difficulty: number;
};

type SubmissionRow = {
    PK: string;
    SK: string;
    GSI1PK: string;
    GSI1SK: string;
    entity: "SUBMISSION";
    id: string;
    status: SubmissionStatus;
    submitter_sub: string;
    language: Language;
    title: string;
    code: string;
    difficulty: number;
    created_at: string;
    decided_at?: string;
    decided_by?: string;
    reject_reason?: string;
    approved_snippet_id?: string;
};

function rowToDto(r: SubmissionRow): SubmissionDto {
    return {
        id: r.id,
        status: r.status,
        language: r.language,
        title: r.title,
        code: r.code,
        difficulty: r.difficulty,
        submitter_sub: r.submitter_sub,
        created_at: r.created_at,
        ...(r.decided_at ? { decided_at: r.decided_at } : {}),
        ...(r.decided_by ? { decided_by: r.decided_by } : {}),
        ...(r.reject_reason ? { reject_reason: r.reject_reason } : {}),
        ...(r.approved_snippet_id ? { approved_snippet_id: r.approved_snippet_id } : {}),
    };
}

export interface SubmissionsRepo {
    put(s: NewSubmission, now?: Date): Promise<Result<{ id: string; created_at: string }, ApiError>>;
    listPending(): Promise<Result<SubmissionDto[], ApiError>>;
    listByUser(sub: string, limit?: number): Promise<Result<SubmissionDto[], ApiError>>;
    findById(id: string): Promise<Result<SubmissionDto | null, ApiError>>;
    countLast24h(sub: string, now?: Date): Promise<Result<number, ApiError>>;
    approve(id: string, modSub: string, now?: Date): Promise<Result<{ snippetId: string }, ApiError>>;
    reject(id: string, modSub: string, reason: string, now?: Date): Promise<Result<void, ApiError>>;
}

const APPROVED_PREFIX = "STATUS#APPROVED#";
const PENDING_PREFIX = "STATUS#PENDING#";

export function makeDdbSubmissionsRepo(
    client: DynamoDBDocumentClient,
    table: string,
): SubmissionsRepo {
    async function rawFindById(id: string): Promise<SubmissionRow | null> {
        // Bounded partition scan; FilterExpression matches at most one row.
        // For larger queues, swap for a dedicated id-lookup row or GSI.
        let ExclusiveStartKey: Record<string, unknown> | undefined;
        do {
            const r = await client.send(
                new QueryCommand({
                    TableName: table,
                    KeyConditionExpression: "PK = :pk",
                    FilterExpression: "id = :id",
                    ExpressionAttributeValues: { ":pk": submissionsPk(), ":id": id },
                    ExclusiveStartKey,
                }),
            );
            const items = (r.Items ?? []) as SubmissionRow[];
            if (items.length > 0) return items[0]!;
            ExclusiveStartKey = r.LastEvaluatedKey;
        } while (ExclusiveStartKey);
        return null;
    }

    return {
        async put({ submitterSub, language, title, code, difficulty }, now = new Date()) {
            const id = randomUUID();
            const created_at = now.toISOString();
            const row: SubmissionRow = {
                PK: submissionsPk(),
                SK: submissionStatusSk("PENDING", created_at, id),
                GSI1PK: userPk(submitterSub),
                GSI1SK: submissionUserGsi1Sk(created_at),
                entity: "SUBMISSION",
                id,
                status: "PENDING",
                submitter_sub: submitterSub,
                language,
                title,
                code,
                difficulty,
                created_at,
            };
            await client.send(new PutCommand({ TableName: table, Item: row }));
            return ok({ id, created_at });
        },

        async listPending() {
            const r = await client.send(
                new QueryCommand({
                    TableName: table,
                    KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
                    ExpressionAttributeValues: { ":pk": submissionsPk(), ":p": PENDING_PREFIX },
                    Limit: 100,
                }),
            );
            return ok(((r.Items ?? []) as SubmissionRow[]).map(rowToDto));
        },

        async listByUser(sub, limit = 50) {
            const r = await client.send(
                new QueryCommand({
                    TableName: table,
                    IndexName: GSI1,
                    KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :p)",
                    ExpressionAttributeValues: { ":pk": userPk(sub), ":p": "SUBMISSION#" },
                    ScanIndexForward: false,
                    Limit: limit,
                }),
            );
            return ok(((r.Items ?? []) as SubmissionRow[]).map(rowToDto));
        },

        async findById(id) {
            const row = await rawFindById(id);
            return ok(row ? rowToDto(row) : null);
        },

        async countLast24h(sub, now = new Date()) {
            const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
            const r = await client.send(
                new QueryCommand({
                    TableName: table,
                    IndexName: GSI1,
                    KeyConditionExpression: "GSI1PK = :pk AND GSI1SK >= :since",
                    ExpressionAttributeValues: {
                        ":pk": userPk(sub),
                        ":since": `SUBMISSION#${cutoff}`,
                    },
                    Select: "COUNT",
                }),
            );
            return ok(r.Count ?? 0);
        },

        async approve(id, modSub, now = new Date()) {
            const row = await rawFindById(id);
            if (!row) return err(apiError("not_found", "submission not found"));
            if (row.status !== "PENDING") {
                return err(apiError("conflict", `submission already ${row.status.toLowerCase()}`));
            }

            const decided_at = now.toISOString();
            const snippetId = `sub-${id.slice(0, 8)}`;
            const newSk = submissionStatusSk("APPROVED", row.created_at, id);
            const updatedRow: SubmissionRow = {
                ...row,
                SK: newSk,
                status: "APPROVED",
                decided_at,
                decided_by: modSub,
                approved_snippet_id: snippetId,
            };

            await client.send(
                new TransactWriteCommand({
                    TransactItems: [
                        {
                            Delete: {
                                TableName: table,
                                Key: { PK: row.PK, SK: row.SK },
                                ConditionExpression: "attribute_exists(PK)",
                            },
                        },
                        { Put: { TableName: table, Item: updatedRow } },
                        {
                            Put: {
                                TableName: table,
                                Item: {
                                    PK: snippetPk(row.language),
                                    SK: snippetSk(snippetId),
                                    GSI2PK: snippetGsi2Pk(row.language),
                                    GSI2SK: snippetGsi2Sk(snippetId),
                                    entity: "SNIPPET",
                                    id: snippetId,
                                    language: row.language,
                                    title: row.title,
                                    code: row.code,
                                    difficulty: row.difficulty,
                                    created_at: decided_at,
                                    submitter_sub: row.submitter_sub,
                                },
                                ConditionExpression: "attribute_not_exists(PK)",
                            },
                        },
                    ],
                }),
            );
            return ok({ snippetId });
        },

        async reject(id, modSub, reason, now = new Date()) {
            const row = await rawFindById(id);
            if (!row) return err(apiError("not_found", "submission not found"));
            if (row.status !== "PENDING") {
                return err(apiError("conflict", `submission already ${row.status.toLowerCase()}`));
            }
            const decided_at = now.toISOString();
            const newSk = submissionStatusSk("REJECTED", row.created_at, id);
            const updatedRow: SubmissionRow = {
                ...row,
                SK: newSk,
                status: "REJECTED",
                decided_at,
                decided_by: modSub,
                reject_reason: reason,
            };
            await client.send(
                new TransactWriteCommand({
                    TransactItems: [
                        {
                            Delete: {
                                TableName: table,
                                Key: { PK: row.PK, SK: row.SK },
                                ConditionExpression: "attribute_exists(PK)",
                            },
                        },
                        { Put: { TableName: table, Item: updatedRow } },
                    ],
                }),
            );
            return ok(undefined);
        },

    };
}

export function makeInMemorySubmissionsRepo(snippets: SnippetsRepo): SubmissionsRepo {
    const rows = new Map<string, SubmissionRow>(); // key: PK|SK
    function findById(id: string): SubmissionRow | null {
        for (const r of rows.values()) if (r.id === id) return r;
        return null;
    }

    return {
        async put({ submitterSub, language, title, code, difficulty }, now = new Date()) {
            const id = randomUUID();
            const created_at = now.toISOString();
            const row: SubmissionRow = {
                PK: submissionsPk(),
                SK: submissionStatusSk("PENDING", created_at, id),
                GSI1PK: userPk(submitterSub),
                GSI1SK: submissionUserGsi1Sk(created_at),
                entity: "SUBMISSION",
                id,
                status: "PENDING",
                submitter_sub: submitterSub,
                language,
                title,
                code,
                difficulty,
                created_at,
            };
            rows.set(`${row.PK}|${row.SK}`, row);
            return ok({ id, created_at });
        },

        async listPending() {
            const out = [...rows.values()].filter((r) => r.status === "PENDING");
            out.sort((a, b) => a.SK.localeCompare(b.SK));
            return ok(out.map(rowToDto));
        },

        async listByUser(sub, limit = 50) {
            const out = [...rows.values()].filter((r) => r.submitter_sub === sub);
            out.sort((a, b) => b.created_at.localeCompare(a.created_at));
            return ok(out.slice(0, limit).map(rowToDto));
        },

        async findById(id) {
            const row = findById(id);
            return ok(row ? rowToDto(row) : null);
        },

        async countLast24h(sub, now = new Date()) {
            const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
            const out = [...rows.values()].filter(
                (r) =>
                    r.submitter_sub === sub && new Date(r.created_at).getTime() >= cutoff,
            );
            return ok(out.length);
        },

        async approve(id, modSub, now = new Date()) {
            const row = findById(id);
            if (!row) return err(apiError("not_found", "submission not found"));
            if (row.status !== "PENDING") {
                return err(apiError("conflict", `submission already ${row.status.toLowerCase()}`));
            }
            const decided_at = now.toISOString();
            const snippetId = `sub-${id.slice(0, 8)}`;
            const newSk = submissionStatusSk("APPROVED", row.created_at, id);
            const updated: SubmissionRow = {
                ...row,
                SK: newSk,
                status: "APPROVED",
                decided_at,
                decided_by: modSub,
                approved_snippet_id: snippetId,
            };
            rows.delete(`${row.PK}|${row.SK}`);
            rows.set(`${updated.PK}|${updated.SK}`, updated);
            await snippets.put({
                PK: snippetPk(row.language),
                SK: snippetSk(snippetId),
                entity: "SNIPPET",
                id: snippetId,
                language: row.language,
                title: row.title,
                code: row.code,
                difficulty: row.difficulty,
                created_at: decided_at,
                submitter_sub: row.submitter_sub,
            });
            return ok({ snippetId });
        },

        async reject(id, modSub, reason, now = new Date()) {
            const row = findById(id);
            if (!row) return err(apiError("not_found", "submission not found"));
            if (row.status !== "PENDING") {
                return err(apiError("conflict", `submission already ${row.status.toLowerCase()}`));
            }
            const decided_at = now.toISOString();
            const newSk = submissionStatusSk("REJECTED", row.created_at, id);
            const updated: SubmissionRow = {
                ...row,
                SK: newSk,
                status: "REJECTED",
                decided_at,
                decided_by: modSub,
                reject_reason: reason,
            };
            rows.delete(`${row.PK}|${row.SK}`);
            rows.set(`${updated.PK}|${updated.SK}`, updated);
            return ok(undefined);
        },

    };
}
