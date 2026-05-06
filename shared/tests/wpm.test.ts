import { describe, expect, test } from "bun:test";
import { accuracyScaledWpm, grossWpm, netWpm } from "../src/wpm";

describe("grossWpm / netWpm / accuracyScaledWpm", () => {
  test("60 correct chars in 60s → 12 wpm across all formulas", () => {
    const i = { charsTotal: 60, charsCorrect: 60, errors: 0, durationMs: 60_000 };
    expect(grossWpm(i)).toBe(12.0);
    expect(netWpm(i)).toBe(12.0);
    expect(accuracyScaledWpm(i)).toBe(12.0);
  });

  test("100 chars / 90 correct / 10 errors / 60s", () => {
    const i = { charsTotal: 100, charsCorrect: 90, errors: 10, durationMs: 60_000 };
    expect(grossWpm(i)).toBe(20.0);
    expect(netWpm(i)).toBe(10.0);
    expect(accuracyScaledWpm(i)).toBe(16.2);
  });

  test("netWpm clamps to 0, never negative", () => {
    const i = { charsTotal: 50, charsCorrect: 0, errors: 50, durationMs: 60_000 };
    expect(netWpm(i)).toBe(0);
  });

  test("durationMs = 0 → all zero (no div by zero)", () => {
    const i = { charsTotal: 60, charsCorrect: 60, errors: 0, durationMs: 0 };
    expect(grossWpm(i)).toBe(0);
    expect(netWpm(i)).toBe(0);
    expect(accuracyScaledWpm(i)).toBe(0);
  });

  test("durationMs < 0 (clock skew) → all zero", () => {
    const i = { charsTotal: 60, charsCorrect: 60, errors: 0, durationMs: -1 };
    expect(grossWpm(i)).toBe(0);
    expect(netWpm(i)).toBe(0);
    expect(accuracyScaledWpm(i)).toBe(0);
  });

  test("perfect 1-second sprint: 25 chars in 1000ms → 300 wpm", () => {
    const i = { charsTotal: 25, charsCorrect: 25, errors: 0, durationMs: 1000 };
    expect(grossWpm(i)).toBe(300.0);
  });

  test("rounds to 1 decimal place (no float artefacts)", () => {
    const i = { charsTotal: 7, charsCorrect: 7, errors: 0, durationMs: 60_000 };
    expect(grossWpm(i)).toBe(1.4);
  });

  test("symbols count the same as letters", () => {
    const i = { charsTotal: 50, charsCorrect: 50, errors: 0, durationMs: 30_000 };
    expect(grossWpm(i)).toBe(20.0);
  });
});
