import { describe, expect, test } from "bun:test";
import { err, isErr, isOk, ok } from "../src/result";

describe("Result", () => {
  test("ok wraps a value", () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (r.ok) expect(r.value).toBe(42);
  });

  test("err wraps an error", () => {
    const r = err("bad");
    expect(r.ok).toBe(false);
    expect(isOk(r)).toBe(false);
    expect(isErr(r)).toBe(true);
    if (!r.ok) expect(r.error).toBe("bad");
  });

  test("discriminated union narrows in TS", () => {
    const r = Math.random() > 2 ? ok(1) : err("e");
    if (r.ok) {
      const v: number = r.value;
      expect(typeof v).toBe("number");
    } else {
      const e: string = r.error;
      expect(typeof e).toBe("string");
    }
  });
});
