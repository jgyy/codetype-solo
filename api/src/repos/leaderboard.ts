import {
    DeleteCommand,
    GetCommand,
    PutCommand,
    QueryCommand,
    type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { ok, padScaled, type ApiError, type Language, type Result } from "@codetype/shared";
import { userPk } from "./keys";

export type LbEntry = {
    sub: string;
    handle: string;
    wpm_scaled: number;
    attempts_in_window: number;
    updated_at: string;
};

export type LbState = {
    lang: Language;
    week: string;
    wpm_scaled: number;
    sk: string; // the SK used in LB#lang#week
};

const lbPk = (lang: Language, week: string) => `LB#${lang}#${week}`;
const lbSk = (wpmScaled: number, sub: string) => `WPM#${padScaled(wpmScaled)}#${sub}`;
const lbStateSk = (lang: Language, week: string) => `LBSTATE#${lang}#${week}`;

export interface LeaderboardRepo {
    /**
     * Reflect a user's new (lang, week) personal best. Writes a fresh entry,
     * removes the previous one if score changed, and updates per-user state.
     * Caller must enforce opt-in and min-evidence (≥3 attempts) — repo just stores.
     */
    upsert(
        lang: Language,
        week: string,
        entry: LbEntry,
    ): Promise<Result<{ updated: boolean }, ApiError>>;

    /** Remove a user's entry (e.g. when attempts_in_window drops below min). */
    remove(lang: Language, week: string, sub: string): Promise<Result<void, ApiError>>;

    /** Top-N entries for a (lang, week), descending by score. */
    topN(lang: Language, week: string, n: number): Promise<Result<LbEntry[], ApiError>>;

    /** Fetch a user's recorded LB state for (lang, week). */
    getState(sub: string, lang: Language, week: string): Promise<Result<LbState | null, ApiError>>;
}

type LbEntryRow = {
    PK: string;
    SK: string;
    entity: "LB_ENTRY";
    sub: string;
    handle: string;
    wpm_scaled: number;
    attempts_in_window: number;
    updated_at: string;
};

type LbStateRow = {
    PK: string;
    SK: string;
    entity: "LB_STATE";
    lang: Language;
    week: string;
    wpm_scaled: number;
    sk: string;
};

function rowToEntry(r: LbEntryRow): LbEntry {
    return {
        sub: r.sub,
        handle: r.handle,
        wpm_scaled: r.wpm_scaled,
        attempts_in_window: r.attempts_in_window,
        updated_at: r.updated_at,
    };
}

export function makeDdbLeaderboardRepo(
    client: DynamoDBDocumentClient,
    table: string,
): LeaderboardRepo {
    return {
        async getState(sub, lang, week) {
            const r = await client.send(
                new GetCommand({
                    TableName: table,
                    Key: { PK: userPk(sub), SK: lbStateSk(lang, week) },
                }),
            );
            if (!r.Item) return ok(null);
            const row = r.Item as LbStateRow;
            return ok({ lang: row.lang, week: row.week, wpm_scaled: row.wpm_scaled, sk: row.sk });
        },

        async upsert(lang, week, entry) {
            const stateRes = await this.getState(entry.sub, lang, week);
            if (!stateRes.ok) return stateRes;
            const prev = stateRes.value;
            // No-op when score didn't improve.
            if (prev && prev.wpm_scaled >= entry.wpm_scaled) return ok({ updated: false });

            const newSk = lbSk(entry.wpm_scaled, entry.sub);
            const entryRow: LbEntryRow = {
                PK: lbPk(lang, week),
                SK: newSk,
                entity: "LB_ENTRY",
                sub: entry.sub,
                handle: entry.handle,
                wpm_scaled: entry.wpm_scaled,
                attempts_in_window: entry.attempts_in_window,
                updated_at: entry.updated_at,
            };
            await client.send(new PutCommand({ TableName: table, Item: entryRow }));

            if (prev && prev.sk !== newSk) {
                await client.send(
                    new DeleteCommand({ TableName: table, Key: { PK: lbPk(lang, week), SK: prev.sk } }),
                );
            }

            const stateRow: LbStateRow = {
                PK: userPk(entry.sub),
                SK: lbStateSk(lang, week),
                entity: "LB_STATE",
                lang,
                week,
                wpm_scaled: entry.wpm_scaled,
                sk: newSk,
            };
            await client.send(new PutCommand({ TableName: table, Item: stateRow }));
            return ok({ updated: true });
        },

        async remove(lang, week, sub) {
            const stateRes = await this.getState(sub, lang, week);
            if (!stateRes.ok) return stateRes;
            const prev = stateRes.value;
            if (!prev) return ok(undefined);
            await client.send(
                new DeleteCommand({ TableName: table, Key: { PK: lbPk(lang, week), SK: prev.sk } }),
            );
            await client.send(
                new DeleteCommand({
                    TableName: table,
                    Key: { PK: userPk(sub), SK: lbStateSk(lang, week) },
                }),
            );
            return ok(undefined);
        },

        async topN(lang, week, n) {
            const r = await client.send(
                new QueryCommand({
                    TableName: table,
                    KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
                    ExpressionAttributeValues: { ":pk": lbPk(lang, week), ":p": "WPM#" },
                    ScanIndexForward: false, // descending = highest WPM first
                    Limit: n,
                }),
            );
            return ok(((r.Items ?? []) as LbEntryRow[]).map(rowToEntry));
        },
    };
}

export function makeInMemoryLeaderboardRepo(): LeaderboardRepo {
    const entries = new Map<string, LbEntryRow>(); // key: PK|SK
    const states = new Map<string, LbStateRow>(); // key: PK|SK

    return {
        async getState(sub, lang, week) {
            const row = states.get(`${userPk(sub)}|${lbStateSk(lang, week)}`);
            if (!row) return ok(null);
            return ok({ lang: row.lang, week: row.week, wpm_scaled: row.wpm_scaled, sk: row.sk });
        },

        async upsert(lang, week, entry) {
            const stateRes = await this.getState(entry.sub, lang, week);
            if (!stateRes.ok) return stateRes;
            const prev = stateRes.value;
            if (prev && prev.wpm_scaled >= entry.wpm_scaled) return ok({ updated: false });

            const newSk = lbSk(entry.wpm_scaled, entry.sub);
            entries.set(`${lbPk(lang, week)}|${newSk}`, {
                PK: lbPk(lang, week),
                SK: newSk,
                entity: "LB_ENTRY",
                sub: entry.sub,
                handle: entry.handle,
                wpm_scaled: entry.wpm_scaled,
                attempts_in_window: entry.attempts_in_window,
                updated_at: entry.updated_at,
            });
            if (prev && prev.sk !== newSk) entries.delete(`${lbPk(lang, week)}|${prev.sk}`);

            states.set(`${userPk(entry.sub)}|${lbStateSk(lang, week)}`, {
                PK: userPk(entry.sub),
                SK: lbStateSk(lang, week),
                entity: "LB_STATE",
                lang,
                week,
                wpm_scaled: entry.wpm_scaled,
                sk: newSk,
            });
            return ok({ updated: true });
        },

        async remove(lang, week, sub) {
            const stateRes = await this.getState(sub, lang, week);
            if (!stateRes.ok) return stateRes;
            const prev = stateRes.value;
            if (!prev) return ok(undefined);
            entries.delete(`${lbPk(lang, week)}|${prev.sk}`);
            states.delete(`${userPk(sub)}|${lbStateSk(lang, week)}`);
            return ok(undefined);
        },

        async topN(lang, week, n) {
            const pk = lbPk(lang, week);
            const matches: LbEntryRow[] = [];
            for (const [k, v] of entries) {
                if (k.startsWith(`${pk}|WPM#`)) matches.push(v);
            }
            matches.sort((a, b) => String(b.SK).localeCompare(String(a.SK)));
            return ok(matches.slice(0, n).map(rowToEntry));
        },
    };
}
