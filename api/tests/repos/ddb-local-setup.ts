import {
    CreateTableCommand,
    DeleteTableCommand,
    DescribeTableCommand,
    DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export type LiveDdb = {
    client: DynamoDBDocumentClient;
    table: string;
    cleanup: () => Promise<void>;
};

export async function provisionLiveTable(name: string): Promise<LiveDdb> {
    const region = process.env.AWS_REGION ?? "us-east-1";
    const endpoint = process.env.DDB_ENDPOINT ?? "http://localhost:8000";
    const raw = new DynamoDBClient({
        region,
        endpoint,
        credentials: { accessKeyId: "dummy", secretAccessKey: "dummy" },
    });
    const doc = DynamoDBDocumentClient.from(raw, {
        marshallOptions: { removeUndefinedValues: true },
    });

    try {
        await raw.send(new DescribeTableCommand({ TableName: name }));
        await raw.send(new DeleteTableCommand({ TableName: name }));
    } catch {
    }

    await raw.send(
        new CreateTableCommand({
            TableName: name,
            BillingMode: "PAY_PER_REQUEST",
            AttributeDefinitions: [
                { AttributeName: "PK", AttributeType: "S" },
                { AttributeName: "SK", AttributeType: "S" },
                { AttributeName: "GSI1PK", AttributeType: "S" },
                { AttributeName: "GSI1SK", AttributeType: "S" },
                { AttributeName: "GSI2PK", AttributeType: "S" },
                { AttributeName: "GSI2SK", AttributeType: "S" },
            ],
            KeySchema: [
                { AttributeName: "PK", KeyType: "HASH" },
                { AttributeName: "SK", KeyType: "RANGE" },
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: "GSI1",
                    KeySchema: [
                        { AttributeName: "GSI1PK", KeyType: "HASH" },
                        { AttributeName: "GSI1SK", KeyType: "RANGE" },
                    ],
                    Projection: { ProjectionType: "ALL" },
                },
                {
                    IndexName: "GSI2",
                    KeySchema: [
                        { AttributeName: "GSI2PK", KeyType: "HASH" },
                        { AttributeName: "GSI2SK", KeyType: "RANGE" },
                    ],
                    Projection: { ProjectionType: "ALL" },
                },
            ],
        }),
    );

    return {
        client: doc,
        table: name,
        async cleanup() {
            try {
                await raw.send(new DeleteTableCommand({ TableName: name }));
            } catch {
            }
        },
    };
}
