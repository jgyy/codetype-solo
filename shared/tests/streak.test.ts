import { describe, expect, test } from "bun:test";
import { streak } from "../src/streak";

describe("streak", () => {
  test("empty input → 0", () => {
    expect(streak([], "2026-05-06")).toBe(0);
  });

  test("today only → 1", () => {
    expect(streak(["2026-05-06"], "2026-05-06")).toBe(1);
  });

  test("today + yesterday → 2", () => {
    expect(streak(["2026-05-06", "2026-05-05"], "2026-05-06")).toBe(2);
  });

  test("gap of one day breaks streak", () => {
    expect(streak(["2026-05-06", "2026-05-04"], "2026-05-06")).toBe(1);
  });

  test("streak ending yesterday but not today → 0", () => {
    expect(streak(["2026-05-05", "2026-05-04"], "2026-05-06")).toBe(0);
  });

  test("duplicates same day are deduped", () => {
    expect(streak(["2026-05-06", "2026-05-06", "2026-05-05"], "2026-05-06")).toBe(2);
  });

  test("unsorted input still works", () => {
    expect(streak(["2026-05-04", "2026-05-06", "2026-05-05"], "2026-05-06")).toBe(3);
  });

  test("12-day streak across month boundary", () => {
    const dates: string[] = [];
    // 2026-04-25 through 2026-05-06 inclusive = 12 days
    for (let d = 25; d <= 30; d++) dates.push(`2026-04-${String(d).padStart(2, "0")}`);
    for (let d = 1; d <= 6; d++) dates.push(`2026-05-0${d}`);
    expect(streak(dates, "2026-05-06")).toBe(12);
  });

  test("future-dated attempts (clock skew) are ignored", () => {
    expect(streak(["2026-05-07", "2026-05-06"], "2026-05-06")).toBe(1);
  });
});
