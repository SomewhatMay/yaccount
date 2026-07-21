import { describe, it, expect } from "vitest";
import {
  cents,
  parseDollars,
  formatCents,
  addCents,
  subCents,
  sumCents,
  negateCents,
} from "@/core/money";

describe("money — cents constructor", () => {
  it("accepts integers", () => {
    expect(cents(0)).toBe(0);
    expect(cents(-1234)).toBe(-1234);
  });
  it("rejects non-integers and non-finite", () => {
    expect(() => cents(1.5)).toThrow();
    expect(() => cents(NaN)).toThrow();
    expect(() => cents(Infinity)).toThrow();
  });
});

describe("money — parseDollars (input edge → integer cents)", () => {
  it("parses plain decimals", () => {
    expect(parseDollars("12.34")).toBe(1234);
    expect(parseDollars("0")).toBe(0);
    expect(parseDollars("0.00")).toBe(0);
    expect(parseDollars("100")).toBe(10000);
    expect(parseDollars(".5")).toBe(50);
    expect(parseDollars("3.1")).toBe(310);
  });
  it("strips currency symbol, grouping commas, and whitespace", () => {
    expect(parseDollars("$1,234.56")).toBe(123456);
    expect(parseDollars("  3.10 ")).toBe(310);
    expect(parseDollars("$0.05")).toBe(5);
  });
  it("handles negative (refunds/reversals keep opposite sign)", () => {
    expect(parseDollars("-5")).toBe(-500);
    expect(parseDollars("-$0.05")).toBe(-5);
  });
  it("rounds half-up on the third decimal via integer math (no float drift)", () => {
    expect(parseDollars("1.005")).toBe(101);
    expect(parseDollars("1.004")).toBe(100);
    expect(parseDollars("0.999")).toBe(100);
  });
  it("throws on invalid input", () => {
    expect(() => parseDollars("")).toThrow();
    expect(() => parseDollars("abc")).toThrow();
    expect(() => parseDollars("1.2.3")).toThrow();
    expect(() => parseDollars("$")).toThrow();
  });
});

describe("money — formatCents (cents → display edge)", () => {
  it("formats with $ and two decimals, grouping thousands", () => {
    expect(formatCents(1234)).toBe("$12.34");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(5)).toBe("$0.05");
  });
  it("renders negatives with an explicit leading minus (spec §5.4)", () => {
    expect(formatCents(-1000)).toBe("-$10.00");
    expect(formatCents(-5)).toBe("-$0.05");
  });
});

describe("money — integer arithmetic never drifts", () => {
  it("add / sub / negate are exact", () => {
    expect(addCents(1234, 66)).toBe(1300);
    expect(subCents(1300, 66)).toBe(1234);
    expect(negateCents(1234)).toBe(-1234);
    expect(negateCents(0)).toBe(0);
  });
  it("property: sumCents equals a naive fold over random integer cents", () => {
    let seed = 987654321;
    const rand = () => {
      // deterministic LCG so the property is reproducible
      seed = (1103515245 * seed + 12345) & 0x7fffffff;
      return (seed % 2000001) - 1000000; // [-1_000_000, 1_000_000] cents
    };
    for (let trial = 0; trial < 500; trial++) {
      const n = seed % 50;
      const xs = Array.from({ length: n }, rand);
      const naive = xs.reduce((a, b) => a + b, 0);
      expect(sumCents(xs)).toBe(naive);
      // parse/format round-trip stays exact for whole-cent values
    }
  });
});
