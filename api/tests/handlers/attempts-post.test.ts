import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../src/lib/dynamo";
import { handler } from "../../src/handlers/attempts-post";

const ddbMock = mockClient(ddb as unknown as DynamoDBDocumentClient);

const baseEvent = (body: unknown, sub = "user-1") =>
  ({
    requestContext: { authorizer: { jwt: { claims: { sub, email: "e@x" } } } },
    body: JSON.stringify(body),
  }) as never;

const validBody = {
  client_attempt_id: "abc123def",
  snippet_id: "js-001",
  language: "js",
  wpm_gross: 12,
  wpm_net: 12,
  wpm_scaled: 12,
  accuracy: 1,
  errors: 0,
  duration_ms: 60_000,
  chars_total: 60,
  chars_correct: 60,
};

beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

describe("POST /attempts", () => {
  test("rejects missing JWT", async () => {
    const r = await handler({ requestContext: {}, body: "{}" } as never);
    expect(r.statusCode).toBe(401);
  });

  test("rejects bad language", async () => {
    const r = await handler(baseEvent({ ...validBody, language: "rust" }));
    expect(r.statusCode).toBe(400);
  });

  test("writes a valid attempt", async () => {
    ddbMock.on(PutCommand).resolves({});
    const r = await handler(baseEvent(validBody));
    expect(r.statusCode).toBe(201);
    const calls = ddbMock.commandCalls(PutCommand);
    expect(calls.length).toBe(1);
    const item = calls[0]!.args[0].input.Item as Record<string, unknown>;
    expect(item.PK).toBe("USER#user-1");
    expect(String(item.SK).startsWith("ATTEMPT#")).toBe(true);
    expect(item.GSI1PK).toBe("USER#user-1");
    expect(String(item.GSI1SK).startsWith("DATE#")).toBe(true);
  });

  test("idempotent on conditional-check failure", async () => {
    const err = new Error("dup");
    (err as Error & { name: string }).name = "ConditionalCheckFailedException";
    ddbMock.on(PutCommand).rejects(err);
    const r = await handler(baseEvent(validBody));
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body)).toMatchObject({ ok: true, data: { duplicate: true } });
  });

  test("flags wpm mismatch when client values diverge", async () => {
    ddbMock.on(PutCommand).resolves({});
    const r = await handler(baseEvent({ ...validBody, wpm_gross: 999 }));
    expect(r.statusCode).toBe(201);
    const item = ddbMock.commandCalls(PutCommand)[0]!.args[0].input.Item as Record<string, unknown>;
    expect(item.wpm_mismatch).toBe(true);
    expect(item.wpm_gross).toBe(12);
  });
});
