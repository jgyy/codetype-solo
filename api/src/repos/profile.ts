import {
    GetCommand,
    UpdateCommand,
    PutCommand,
    type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { ok, type ApiError, type Result } from "@codetype/shared";
import { profileSk, userPk } from "./keys";

export type ProfileRow = {
    PK: string;
    SK: "PROFILE";
    entity: "PROFILE";
    email: string | null;
    created_at: string;
    handle?: string;
    leaderboard_optin?: boolean;
    display_name?: string;
    handle_changed_at?: string;
};

export type ProfilePatch = {
    email?: string | null;
    handle?: string;
    leaderboard_optin?: boolean;
    display_name?: string;
    handle_changed_at?: string;
};

export interface ProfileRepo {
    /** Idempotent first-seen record. Returns whether a new row was written. */
    upsert(sub: string, patch: { email: string | null }): Promise<Result<{ created: boolean }, ApiError>>;
    /** Read full profile row, or null if absent. */
    get(sub: string): Promise<Result<ProfileRow | null, ApiError>>;
    /** Apply a partial update; rejects if profile doesn't exist yet. */
    patch(sub: string, patch: ProfilePatch): Promise<Result<ProfileRow, ApiError>>;
}

const PATCH_FIELDS: (keyof ProfilePatch)[] = [
    "email",
    "handle",
    "leaderboard_optin",
    "display_name",
    "handle_changed_at",
];

function buildUpdate(patch: ProfilePatch) {
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const sets: string[] = [];
    let i = 0;
    for (const f of PATCH_FIELDS) {
        if (patch[f] === undefined) continue;
        const n = `#f${i}`;
        const v = `:v${i}`;
        names[n] = f;
        values[v] = patch[f];
        sets.push(`${n} = ${v}`);
        i++;
    }
    return { names, values, sets };
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

        async get(sub) {
            const r = await client.send(
                new GetCommand({ TableName: table, Key: { PK: userPk(sub), SK: profileSk() } }),
            );
            if (!r.Item) return ok(null);
            return ok(r.Item as ProfileRow);
        },

        async patch(sub, patch) {
            const { names, values, sets } = buildUpdate(patch);
            if (sets.length === 0) {
                const cur = await this.get(sub);
                if (!cur.ok || !cur.value) return cur as Result<ProfileRow, ApiError>;
                return ok(cur.value);
            }
            const r = await client.send(
                new UpdateCommand({
                    TableName: table,
                    Key: { PK: userPk(sub), SK: profileSk() },
                    UpdateExpression: `SET ${sets.join(", ")}`,
                    ExpressionAttributeNames: names,
                    ExpressionAttributeValues: values,
                    ConditionExpression: "attribute_exists(PK)",
                    ReturnValues: "ALL_NEW",
                }),
            );
            return ok(r.Attributes as ProfileRow);
        },
    };
}

export function makeInMemoryProfileRepo(): ProfileRepo {
    const rows = new Map<string, ProfileRow>();
    return {
        async upsert(sub, patch) {
            if (rows.has(sub)) return ok({ created: false });
            rows.set(sub, {
                PK: userPk(sub),
                SK: "PROFILE",
                entity: "PROFILE",
                email: patch.email,
                created_at: new Date().toISOString(),
            });
            return ok({ created: true });
        },
        async get(sub) {
            return ok(rows.get(sub) ?? null);
        },
        async patch(sub, patch) {
            const cur = rows.get(sub);
            if (!cur) {
                // mirrors DDB ConditionExpression: attribute_exists(PK) failure
                throw Object.assign(new Error("profile not found"), { name: "ConditionalCheckFailedException" });
            }
            const next: ProfileRow = { ...cur };
            for (const f of PATCH_FIELDS) {
                if (patch[f] !== undefined) (next as Record<string, unknown>)[f] = patch[f];
            }
            rows.set(sub, next);
            return ok(next);
        },
    };
}
