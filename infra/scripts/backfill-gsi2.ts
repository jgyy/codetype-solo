#!/usr/bin/env bun

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    ScanCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { resolveTableName } from "./_stack";

const REGION = process.env.AWS_REGION ?? "ap-southeast-1";
const TABLE = resolveTableName();
const ENDPOINT = process.env.DDB_ENDPOINT;

const ddb = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: REGION, ...(ENDPOINT ? { endpoint: ENDPOINT } : {}) }),
);

type SnippetRow = {
    PK: string;
    SK: string;
    entity: string;
    language: string;
    id?: string;
    GSI2PK?: string;
    GSI2SK?: string;
};

async function main() {
    let scanned = 0;
    let patched = 0;
    let alreadyOk = 0;
    let ExclusiveStartKey: Record<string, unknown> | undefined;

    do {
        const r = await ddb.send(
            new ScanCommand({
                TableName: TABLE,
                FilterExpression: "entity = :e",
                ExpressionAttributeValues: { ":e": "SNIPPET" },
                ExclusiveStartKey,
            }),
        );
        const items = (r.Items ?? []) as SnippetRow[];
        for (const it of items) {
            scanned++;
            if (it.GSI2PK && it.GSI2SK) {
                alreadyOk++;
                continue;
            }
            const id = it.id ?? it.SK.replace(/^SNIPPET#/, "");
            await ddb.send(
                new UpdateCommand({
                    TableName: TABLE,
                    Key: { PK: it.PK, SK: it.SK },
                    UpdateExpression: "SET #pk = :pk, #sk = :sk",
                    ConditionExpression:
                        "attribute_exists(PK) AND (attribute_not_exists(GSI2PK) OR attribute_not_exists(GSI2SK))",
                    ExpressionAttributeNames: { "#pk": "GSI2PK", "#sk": "GSI2SK" },
                    ExpressionAttributeValues: {
                        ":pk": `LANG#${it.language}`,
                        ":sk": `SNIPPET#${id}`,
                    },
                }),
            );
            patched++;
        }
        ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    console.log(JSON.stringify({ scanned, patched, alreadyOk }, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
