import { describe, it, expect } from "vitest";
import {
  COMPARE_OFF,
  decodeComparePref,
  decodePeriod,
  encodeComparePref,
  encodePeriod,
  isPeriodPref,
} from "./period-pref";
import type { ReportingPeriod } from "@/core/engine/period";

describe("encodePeriod / decodePeriod — the reporting period as one stored string", () => {
  const cases: [string, ReportingPeriod][] = [
    ["p:last-month", { kind: "preset", preset: "last-month" }],
    ["p:last-3-months", { kind: "preset", preset: "last-3-months" }],
    ["p:all", { kind: "preset", preset: "all" }],
    [
      "c:2026-01-01:2026-07-22",
      { kind: "custom", start: "2026-01-01", end: "2026-07-22" },
    ],
  ];

  it.each(cases)("round-trips %s", (encoded, period) => {
    expect(encodePeriod(period)).toBe(encoded);
    expect(decodePeriod(encoded)).toEqual(period);
  });

  it("refuses a preset this build does not know", () => {
    // A period written by a newer version must fall back, not put the dashboard
    // in a state it has no code to resolve.
    expect(decodePeriod("p:last-decade")).toBeNull();
    expect(isPeriodPref("p:last-decade")).toBe(false);
  });

  it("refuses a custom window that is not two real calendar dates", () => {
    expect(decodePeriod("c:2026-13-45:2026-07-22")).toBeNull();
    expect(decodePeriod("c:2026-02-30:2026-07-22")).toBeNull();
    expect(decodePeriod("c:2026-01-01")).toBeNull();
    expect(decodePeriod("c::")).toBeNull();
  });

  it("refuses a custom window that runs backwards", () => {
    expect(decodePeriod("c:2026-07-22:2026-01-01")).toBeNull();
  });

  it("refuses noise", () => {
    for (const raw of ["", "last-3-months", "x:y", "p:", ":", "{}"]) {
      expect(decodePeriod(raw)).toBeNull();
      expect(isPeriodPref(raw)).toBe(false);
    }
  });

  it("accepts what it writes", () => {
    for (const [encoded] of cases) expect(isPeriodPref(encoded)).toBe(true);
  });
});

describe("the compare window — 'off' is a value, not a missing one", () => {
  it("stores no-compare as its own token", () => {
    expect(encodeComparePref(null)).toBe(COMPARE_OFF);
    expect(decodeComparePref(COMPARE_OFF)).toBeNull();
    expect(isPeriodPref(COMPARE_OFF)).toBe(true);
  });

  it("stores a compare window like any other period", () => {
    const p: ReportingPeriod = { kind: "preset", preset: "last-month" };
    expect(encodeComparePref(p)).toBe("p:last-month");
    expect(decodeComparePref("p:last-month")).toEqual(p);
  });

  it("reads noise as off rather than throwing", () => {
    expect(decodeComparePref("nonsense")).toBeNull();
  });
});
