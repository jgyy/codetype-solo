import { describe, expect, test } from "bun:test";
import { apiError, err, ok } from "@codetype/shared";
import { httpAdapter, type Handler } from "../../src/lib/http";

const evt = (overrides: Record<string, unknown> = {}) =>
  ({
    requestContext: { requestId: "req-1", http: { method: "GET" } },
    ...overrides,
  }) as never;

describe("httpAdapter", () => {
  test("wraps success in envelope and uses method-derived 200 for GET", async () => {
    const h: Handler<{ x: number }> = async () => ok({ x: 1 });
    const r = (await httpAdapter(h)(evt())) as { statusCode: number; body: string; headers: Record<string, string> };
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ ok: true, data: { x: 1 } });
    expect(r.headers["x-request-id"]).toBe("req-1");
  });

  test("uses 201 for POST by default", async () => {
    const h: Handler<{ x: number }> = async () => ok({ x: 1 });
    const r = (await httpAdapter(h)(
      evt({ requestContext: { requestId: "r", http: { method: "POST" } } }),
    )) as { statusCode: number };
    expect(r.statusCode).toBe(201);
  });

  test("successStatus function chooses status from value", async () => {
    type V = { created: boolean };
    const h: Handler<V> = async () => ok({ created: false });
    const r = (await httpAdapter(h, { successStatus: (v) => (v.created ? 201 : 200) })(
      evt({ requestContext: { requestId: "r", http: { method: "POST" } } }),
    )) as { statusCode: number };
    expect(r.statusCode).toBe(200);
  });

  test("maps each ApiError code to the right HTTP status", async () => {
    const cases = [
      ["unauthorized", 401],
      ["bad_request", 400],
      ["not_found", 404],
      ["conflict", 409],
      ["rate_limited", 429],
      ["internal", 500],
    ] as const;
    for (const [code, status] of cases) {
      const h: Handler<never> = async () => err(apiError(code, "m"));
      const r = (await httpAdapter(h)(evt())) as { statusCode: number; body: string };
      expect(r.statusCode).toBe(status);
      const body = JSON.parse(r.body);
      expect(body).toMatchObject({ ok: false, error: { code, message: "m" } });
    }
  });

  test("unhandled throws become internal envelope without leaking stack", async () => {
    const h: Handler<never> = async () => {
      throw new Error("boom: secret-stack-trace");
    };
    const r = (await httpAdapter(h)(evt())) as { statusCode: number; body: string };
    expect(r.statusCode).toBe(500);
    const body = JSON.parse(r.body);
    expect(body).toEqual({
      ok: false,
      error: { code: "internal", message: "internal_error" },
    });
    expect(JSON.stringify(body)).not.toContain("secret-stack-trace");
  });
});
