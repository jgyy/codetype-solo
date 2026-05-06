import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../src/lib/dynamo";
import { handler } from "../../src/handlers/profile-upsert";

const ddbMock = mockClient(ddb as unknown as DynamoDBDocumentClient);

const evt = (sub = "u-1", email = "e@x") =>
  ({ requestContext: { authorizer: { jwt: { claims: { sub, email } } } } }) as never;

beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

describe("POST /profile", () => {
  test("creates on first call", async () => {
    ddbMock.on(PutCommand).resolves({});
    const r = await handler(evt());
    expect(r.statusCode).toBe(201);
    expect(JSON.parse(r.body)).toMatchObject({ created: true });
  });

  test("returns 200 on conditional-check failure (already exists)", async () => {
    const err = Object.assign(new Error("dup"), { name: "ConditionalCheckFailedException" });
    ddbMock.on(PutCommand).rejects(err);
    const r = await handler(evt());
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body)).toMatchObject({ created: false });
  });
});
