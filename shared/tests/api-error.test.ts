import { describe, expect, test } from "bun:test";
import { apiError, STATUS_BY_CODE, type ErrorCode } from "../src/api-error";

describe("ApiError", () => {
  test("status mapping covers every code", () => {
    const codes: ErrorCode[] = [
      "unauthorized",
      "bad_request",
      "not_found",
      "conflict",
      "rate_limited",
      "internal",
    ];
    for (const c of codes) {
      expect(STATUS_BY_CODE[c]).toBeGreaterThanOrEqual(400);
      expect(STATUS_BY_CODE[c]).toBeLessThan(600);
    }
    expect(STATUS_BY_CODE.unauthorized).toBe(401);
    expect(STATUS_BY_CODE.bad_request).toBe(400);
    expect(STATUS_BY_CODE.not_found).toBe(404);
    expect(STATUS_BY_CODE.conflict).toBe(409);
    expect(STATUS_BY_CODE.rate_limited).toBe(429);
    expect(STATUS_BY_CODE.internal).toBe(500);
  });

  test("apiError omits details when undefined", () => {
    const e = apiError("bad_request", "x");
    expect("details" in e).toBe(false);
  });

  test("apiError keeps details when provided", () => {
    const e = apiError("bad_request", "x", { field: "y" });
    expect(e.details).toEqual({ field: "y" });
  });
});
