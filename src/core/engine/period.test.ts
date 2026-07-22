import { describe, it, expect } from "vitest";
import {
  resolvePeriod,
  inRange,
  monthKeysInRange,
  monthsInRange,
  type ReportingPeriod,
} from "./period";

const TODAY = "2026-07-21";

describe("resolvePeriod — rolling from today (locked M5)", () => {
  it("last-month = one month back … today, inclusive", () => {
    expect(resolvePeriod({ kind: "preset", preset: "last-month" }, TODAY)).toEqual({
      start: "2026-06-21",
      end: "2026-07-21",
    });
  });

  it("last-3-months = three months back … today", () => {
    expect(resolvePeriod({ kind: "preset", preset: "last-3-months" }, TODAY)).toEqual({
      start: "2026-04-21",
      end: "2026-07-21",
    });
  });

  it("last-6-months / last-12-months", () => {
    expect(resolvePeriod({ kind: "preset", preset: "last-6-months" }, TODAY).start).toBe(
      "2026-01-21",
    );
    expect(resolvePeriod({ kind: "preset", preset: "last-12-months" }, TODAY).start).toBe(
      "2025-07-21",
    );
  });

  it("ytd = Jan 1 of the current year … today", () => {
    expect(resolvePeriod({ kind: "preset", preset: "ytd" }, TODAY)).toEqual({
      start: "2026-01-01",
      end: "2026-07-21",
    });
  });

  it("all = fully unbounded", () => {
    expect(resolvePeriod({ kind: "preset", preset: "all" }, TODAY)).toEqual({
      start: null,
      end: null,
    });
  });

  it("custom passes its own bounds through", () => {
    const p: ReportingPeriod = { kind: "custom", start: "2026-02-01", end: "2026-02-28" };
    expect(resolvePeriod(p, TODAY)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("month arithmetic clamps to a real calendar day (Jul 31 → Jun 30)", () => {
    expect(
      resolvePeriod({ kind: "preset", preset: "last-month" }, "2026-07-31").start,
    ).toBe("2026-06-30");
  });
});

describe("inRange — inclusive, unbounded-aware", () => {
  const r = { start: "2026-04-01", end: "2026-06-30" };
  it("includes the endpoints", () => {
    expect(inRange("2026-04-01", r)).toBe(true);
    expect(inRange("2026-06-30", r)).toBe(true);
  });
  it("excludes outside", () => {
    expect(inRange("2026-03-31", r)).toBe(false);
    expect(inRange("2026-07-01", r)).toBe(false);
  });
  it("null bounds mean unbounded on that side", () => {
    expect(inRange("1999-01-01", { start: null, end: "2026-06-30" })).toBe(true);
    expect(inRange("2999-01-01", { start: "2026-04-01", end: null })).toBe(true);
    expect(inRange("2026-05-05", { start: null, end: null })).toBe(true);
  });
});

describe("monthKeysInRange", () => {
  it("lists every yearMonth the concrete range touches, inclusive", () => {
    expect(monthKeysInRange({ start: "2026-04-21", end: "2026-07-21" }, [])).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
  });

  it("crosses a year boundary", () => {
    expect(monthKeysInRange({ start: "2025-11-15", end: "2026-01-02" }, [])).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
  });

  it("derives bounds from the supplied data dates when the range is unbounded (all)", () => {
    const dates = ["2026-03-10", "2026-01-05", "2026-02-20"];
    expect(monthKeysInRange({ start: null, end: null }, dates)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("empty when unbounded and no data", () => {
    expect(monthKeysInRange({ start: null, end: null }, [])).toEqual([]);
  });
});

describe("monthsInRange — the monthly-average divisor (>= 1)", () => {
  it("counts the touched month keys", () => {
    expect(monthsInRange({ start: "2026-04-21", end: "2026-07-21" }, [])).toBe(4);
  });
  it("never returns 0 (single-day range still averages over one month)", () => {
    expect(monthsInRange({ start: "2026-07-21", end: "2026-07-21" }, [])).toBe(1);
    expect(monthsInRange({ start: null, end: null }, [])).toBe(1);
  });
});
