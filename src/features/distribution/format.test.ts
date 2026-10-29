import { describe, it, expect } from "vitest";
import { formatBps, formatShare, parsePercent } from "./format";

describe("formatBps — a stored share as the user typed it", () => {
  it("drops trailing zeros", () => {
    expect(formatBps(2000)).toBe("20%");
    expect(formatBps(1250)).toBe("12.5%");
    expect(formatBps(3333)).toBe("33.33%");
    expect(formatBps(1)).toBe("0.01%");
    expect(formatBps(0)).toBe("0%");
    expect(formatBps(10000)).toBe("100%");
  });
});

describe("parsePercent — typed % to basis points", () => {
  it("reads whole and decimal percents", () => {
    expect(parsePercent("20")).toEqual({ ok: true, bps: 2000 });
    expect(parsePercent(" 12.5 ")).toEqual({ ok: true, bps: 1250 });
    expect(parsePercent("33.33")).toEqual({ ok: true, bps: 3333 });
    expect(parsePercent("0.01")).toEqual({ ok: true, bps: 1 });
    expect(parsePercent("20%")).toEqual({ ok: true, bps: 2000 });
    expect(parsePercent(".5")).toEqual({ ok: true, bps: 50 });
  });

  it("refuses blank, zero, over 100, negatives, junk and more than 2 decimals", () => {
    for (const bad of [
      "",
      "  ",
      "0",
      "0.00",
      "100.01",
      "-5",
      "abc",
      "1.234",
      "1e2",
      "5..1",
    ]) {
      expect(parsePercent(bad).ok).toBe(false);
    }
  });

  it("allows exactly 100", () => {
    expect(parsePercent("100")).toEqual({ ok: true, bps: 10000 });
  });
});

describe("formatShare — a fraction read back from the cents", () => {
  it("shows whole percents plainly and others to one decimal", () => {
    expect(formatShare(0.2)).toBe("20%");
    expect(formatShare(0.47)).toBe("47%");
    expect(formatShare(1 / 3)).toBe("33.3%");
    expect(formatShare(0.33000033)).toBe("33%");
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(-0.5)).toBe("−50%");
  });
});
