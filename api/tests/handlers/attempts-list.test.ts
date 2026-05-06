import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../src/lib/dynamo";
import { handler } from "../../src/handlers/attempts-list";

const ddbMock = mockClient(ddb as unknown as DynamoDBDocumentClient);

beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

describe("GET /attempts", () => {
  test("queries GSI1 by sub + date range", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [{ snippet_id: "js-001" }] });
    const r = await handler({
      requestContext: { authorizer: { jwt: { claims: { sub: "u-1" } } } },
      queryStringParameters: { from: "2026-05-01", to: "2026-05-06" },
    } as never);
    expect(r.statusCode).toBe(200);
    const call = ddbMock.commandCalls(QueryCommand)[0]!.args[0].input;
    expect(call.IndexName).toBe("GSI1");
    expect(call.ExpressionAttributeValues).toMatchObject({
      ":pk": "USER#u-1",
      ":from": "DATE#2026-05-01",
      ":to": "DATE#2026-05-06~",
    });
  });
});
