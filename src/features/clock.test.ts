import { describe, it, expect } from "vitest";
import {
  dateTimeInputValue,
  formatEnteredAt,
  formatEnteredTime,
  instantFrom,
  instantFromNow,
  nowDateTimeInput,
  splitDateTime,
  thisMonthIso,
  timeInputValue,
  todayIso,
  toIsoDate,
  yesterdayIso,
} from "./clock";

// Dates are built from LOCAL calendar fields so these assertions hold in any
// timezone the suite happens to run in — which is the whole point of the module.
const local = (y: number, m: number, d: number, h = 12, min = 0, sec = 0): Date =>
  new Date(y, m - 1, d, h, min, sec);

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

describe("editing an entry's time — the date input's missing half", () => {
  it("reads a stored instant back as a local HH:mm the time input accepts", () => {
    expect(timeInputValue(local(2026, 7, 22, 17, 41).toISOString())).toBe("17:41");
    expect(timeInputValue(local(2026, 7, 22, 9, 5).toISOString())).toBe("09:05");
    expect(timeInputValue(local(2026, 7, 22, 0, 0).toISOString())).toBe("00:00");
  });

  it("has no time to show for a row that carries no instant", () => {
    for (const bad of [null, undefined, "", "not a date"])
      expect(timeInputValue(bad)).toBe("");
  });

  it("builds an instant from the date and time the user picked, in THEIR zone", () => {
    const iso = instantFrom("2026-07-22", "17:41");
    expect(iso).not.toBeNull();
    const back = new Date(iso!);
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(6);
    expect(back.getDate()).toBe(22);
    expect(back.getHours()).toBe(17);
    expect(back.getMinutes()).toBe(41);
  });

  it("round-trips: instant → input → instant is stable to the minute", () => {
    const start = local(2026, 7, 22, 17, 41).toISOString();
    expect(instantFrom("2026-07-22", timeInputValue(start))).toBe(start);
  });

  it("yields nothing when either half is missing, so a legacy row stays null", () => {
    expect(instantFrom("2026-07-22", "")).toBeNull();
    expect(instantFrom("", "17:41")).toBeNull();
    expect(instantFrom("2026-07-22", "bogus")).toBeNull();
  });

  it("moves the instant onto a new date when the entry is re-dated", () => {
    // Backdating a row keeps the time of day it happened at.
    const moved = instantFrom("2026-07-15", "17:41")!;
    expect(new Date(moved).getDate()).toBe(15);
    expect(new Date(moved).getHours()).toBe(17);
  });

  it("survives the spring-forward gap without producing an invalid instant", () => {
    // 02:30 does not exist on 2026-03-08 in US zones; the engine slides it, and
    // what matters is that we never hand a NaN date to the ledger.
    const iso = instantFrom("2026-03-08", "02:30");
    expect(iso === null || !Number.isNaN(Date.parse(iso))).toBe(true);
  });
});

describe("instantFromNow — several entries pinned to one minute keep their order", () => {
  it("keeps the minute the user picked but takes seconds from the clock", () => {
    const iso = instantFromNow("2026-07-18", "20:00", local(2026, 7, 22, 9, 0, 37))!;
    const d = new Date(iso);
    expect(d.getDate()).toBe(18); // their date
    expect(d.getHours()).toBe(20); // their hour
    expect(d.getMinutes()).toBe(0); // their minute
    expect(d.getSeconds()).toBe(37); // the write order
  });

  it("separates three receipts logged against the same pinned minute", () => {
    // Without this they would share an instant and tie-break on a random UUID —
    // the exact failure `entered_at` was added to fix.
    const stamps = [11, 37, 59].map((s) =>
      instantFromNow("2026-07-18", "20:00", local(2026, 7, 22, 9, 0, s))!,
    );
    expect(new Set(stamps).size).toBe(3);
    expect([...stamps].sort()).toEqual(stamps); // and in the order written
  });

  it("still yields nothing when there is no time to pin", () => {
    expect(instantFromNow("2026-07-18", "")).toBeNull();
  });
});

describe("the compose bar's single datetime-local control", () => {
  it("renders a date and instant as one input value", () => {
    const at = local(2026, 7, 22, 17, 41).toISOString();
    expect(dateTimeInputValue("2026-07-22", at)).toBe("2026-07-22T17:41");
  });

  it("falls back to midnight when the row has no instant", () => {
    expect(dateTimeInputValue("2026-07-22", null)).toBe("2026-07-22T00:00");
  });

  it("seeds itself from the local clock", () => {
    expect(nowDateTimeInput(local(2026, 7, 22, 20, 30))).toBe("2026-07-22T20:30");
  });

  it("splits the control's value back into the two fields the row stores", () => {
    expect(splitDateTime("2026-07-22T17:41")).toEqual({
      date: "2026-07-22",
      time: "17:41",
    });
    // some browsers append seconds
    expect(splitDateTime("2026-07-22T17:41:09")).toEqual({
      date: "2026-07-22",
      time: "17:41",
    });
    expect(splitDateTime("")).toEqual({ date: "", time: "" });
  });
});
