import { describe, expect, test } from "bun:test";
import {
  DailyQuery,
  GetSnippetParams,
  ListAttemptsQuery,
  PostAttemptBody,
  SnippetSeedRow,
} from "../src/schemas";

const validAttempt = {
  client_attempt_id: "abc123",
  snippet_id: "js-001",
  language: "js" as const,
  duration_ms: 60_000,
  chars_total: 60,
  chars_correct: 60,
  errors: 0,
  accuracy: 1,
  wpm_gross: 12,
  wpm_net: 12,
  wpm_scaled: 12,
};

describe("PostAttemptBody", () => {
  test("accepts a valid attempt", () => {
    expect(PostAttemptBody.safeParse(validAttempt).success).toBe(true);
  });

  test("rejects unknown language (type confusion)", () => {
    const r = PostAttemptBody.safeParse({ ...validAttempt, language: "rust" });
    expect(r.success).toBe(false);
  });

  test("rejects string duration_ms (type confusion)", () => {
    const r = PostAttemptBody.safeParse({ ...validAttempt, duration_ms: "60000" });
    expect(r.success).toBe(false);
  });

  test("rejects non-positive duration_ms", () => {
    const r = PostAttemptBody.safeParse({ ...validAttempt, duration_ms: 0 });
    expect(r.success).toBe(false);
  });

  test("rejects chars_correct > chars_total via refine", () => {
    const r = PostAttemptBody.safeParse({
      ...validAttempt,
      chars_correct: 100,
      chars_total: 60,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["chars_correct"]);
  });

  test("rejects accuracy out of [0,1]", () => {
    expect(PostAttemptBody.safeParse({ ...validAttempt, accuracy: -0.1 }).success).toBe(false);
    expect(PostAttemptBody.safeParse({ ...validAttempt, accuracy: 1.1 }).success).toBe(false);
  });

  test("rejects exceedingly long duration_ms", () => {
    expect(
      PostAttemptBody.safeParse({ ...validAttempt, duration_ms: 60 * 60_000 }).success,
    ).toBe(false);
  });
});

describe("ListAttemptsQuery", () => {
  test("accepts valid YYYY-MM-DD", () => {
    expect(ListAttemptsQuery.safeParse({ from: "2026-01-01", to: "2026-12-31" }).success).toBe(
      true,
    );
  });
  test("accepts empty (both optional)", () => {
    expect(ListAttemptsQuery.safeParse({}).success).toBe(true);
  });
  test("rejects malformed date", () => {
    expect(ListAttemptsQuery.safeParse({ from: "01-01-2026" }).success).toBe(false);
  });
});

describe("DailyQuery", () => {
  test("accepts valid date or empty", () => {
    expect(DailyQuery.safeParse({ date: "2026-05-07" }).success).toBe(true);
    expect(DailyQuery.safeParse({}).success).toBe(true);
  });
  test("rejects bad date", () => {
    expect(DailyQuery.safeParse({ date: "not-a-date" }).success).toBe(false);
  });
});

describe("GetSnippetParams", () => {
  test("accepts known language and id", () => {
    expect(GetSnippetParams.safeParse({ lang: "js", id: "abc" }).success).toBe(true);
  });
  test("rejects unknown language", () => {
    expect(GetSnippetParams.safeParse({ lang: "rust", id: "abc" }).success).toBe(false);
  });
});

describe("SnippetSeedRow", () => {
  test("accepts a well-formed row", () => {
    expect(
      SnippetSeedRow.safeParse({ id: "js-001", title: "T", code: "x;", difficulty: 1 }).success,
    ).toBe(true);
  });
  test("rejects out-of-range difficulty", () => {
    expect(
      SnippetSeedRow.safeParse({ id: "x", title: "T", code: "y", difficulty: 10 }).success,
    ).toBe(false);
  });
  test("rejects missing fields", () => {
    expect(SnippetSeedRow.safeParse({ id: "x" }).success).toBe(false);
  });
});
