import { describe, it, expect } from "vitest";
import {
  formatEnteredAt,
  formatEnteredTime,
  thisMonthIso,
  todayIso,
  toIsoDate,
  yesterdayIso,
} from "./clock";

// Dates are built from LOCAL calendar fields so these assertions hold in any
// timezone the suite happens to run in — which is the whole point of the module.
const local = (y: number, m: number, d: number, h = 12, min = 0): Date =>
  new Date(y, m - 1, d, h, min);

describe("todayIso — the user's calendar day, not UTC's", () => {
  it("reads the local calendar fields", () => {
    expect(todayIso(local(2026, 7, 22, 14, 30))).toBe("2026-07-22");
  });

  it("still says 'today' late in the evening", () => {
    // The bug this replaces: at 20:30 in UTC-4, `toISOString()` already reads
    // 2026-07-23, so an entry logged tonight was filed on tomorrow's date.
    expect(todayIso(local(2026, 7, 22, 20, 30))).toBe("2026-07-22");
    expect(todayIso(local(2026, 7, 22, 23, 59))).toBe("2026-07-22");
  });

  it("still says 'today' just after midnight", () => {
    expect(todayIso(local(2026, 7, 22, 0, 1))).toBe("2026-07-22");
  });

  it("zero-pads month and day", () => {
    expect(toIsoDate(local(2026, 1, 5))).toBe("2026-01-05");
  });
});

describe("yesterdayIso — calendar arithmetic, not minus-24-hours", () => {
  it("steps back one day", () => {
    expect(yesterdayIso(local(2026, 7, 22))).toBe("2026-07-21");
  });

  it("crosses a month boundary", () => {
    expect(yesterdayIso(local(2026, 8, 1))).toBe("2026-07-31");
  });

  it("crosses a year boundary", () => {
    expect(yesterdayIso(local(2026, 1, 1))).toBe("2025-12-31");
  });

  it("handles a leap day", () => {
    expect(yesterdayIso(local(2028, 3, 1))).toBe("2028-02-29");
  });

  it("survives the spring-forward day, which is only 23 hours long", () => {
    // `now - 86400000` lands on the same calendar day when a day is short.
    expect(yesterdayIso(local(2026, 3, 9, 1, 30))).toBe("2026-03-08");
  });
});

describe("thisMonthIso — the local reporting month (§8.3)", () => {
  it("matches the local calendar on the last evening of a month", () => {
    expect(thisMonthIso(local(2026, 7, 31, 21, 0))).toBe("2026-07");
    expect(thisMonthIso(local(2026, 8, 1, 0, 30))).toBe("2026-08");
  });
});

describe("formatting an entry instant", () => {
  it("renders a clock time and a full stamp", () => {
    const at = local(2026, 7, 22, 14, 4).toISOString();
    expect(formatEnteredTime(at)).toMatch(/\d/);
    expect(formatEnteredAt(at)).toMatch(/2026/);
  });

  it("renders nothing for a row with no instant (pre-M11) or a broken one", () => {
    for (const bad of [null, undefined, "", "not a date"]) {
      expect(formatEnteredTime(bad)).toBeNull();
      expect(formatEnteredAt(bad)).toBeNull();
    }
  });
});
