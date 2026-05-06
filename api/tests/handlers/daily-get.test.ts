import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../src/lib/dynamo";
import { handler } from "../../src/handlers/daily-get";

const ddbMock = mockClient(ddb as unknown as DynamoDBDocumentClient);

beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

describe("GET /daily", () => {
  test("returns existing seed without write", async () => {
    ddbMock
      .on(GetCommand)
      .resolves({ Item: { PK: "DAILY", SK: "DATE#2026-05-06", snippet_id: "js-001" } });
    const r = await handler({ queryStringParameters: { date: "2026-05-06" } } as never);
    expect(r.statusCode).toBe(200);
    expect(ddbMock.commandCalls(PutCommand).length).toBe(0);
  });

  test("self-seeds when missing (deterministic by date)", async () => {
    ddbMock.on(GetCommand).resolvesOnce({ Item: undefined });
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { SK: "SNIPPET#js-001", language: "js" },
        { SK: "SNIPPET#py-001", language: "py" },
      ],
    });
    ddbMock.on(PutCommand).resolves({});
    const r1 = await handler({ queryStringParameters: { date: "2026-05-06" } } as never);
    expect(r1.statusCode).toBe(200);
    const item = ddbMock.commandCalls(PutCommand)[0]!.args[0].input.Item as Record<string, unknown>;
    expect(item.PK).toBe("DAILY");
    expect(item.SK).toBe("DATE#2026-05-06");
  });

  test("rejects malformed date", async () => {
    const r = await handler({ queryStringParameters: { date: "not-a-date" } } as never);
    expect(r.statusCode).toBe(400);
  });
});
