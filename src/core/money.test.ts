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

describe("parseDollars — hostile input never becomes a wrong amount", () => {
  it("rejects interior separators instead of silently coercing them", () => {
    // "12.3 4" must NOT quietly become $12.34 — a wrong amount on disk is the
    // one failure this module exists to prevent.
    for (const bad of ["1$2", "1 2 3", "12.3 4", "12$", "1,,2", "$1$", "1.2.3"]) {
      expect(() => parseDollars(bad), bad).toThrow();
    }
  });

  it("still accepts the shapes a human actually types", () => {
    expect(parseDollars(" $1,234.50 ")).toBe(123450);
    expect(parseDollars("-$12.34")).toBe(-1234);
    expect(parseDollars("0.5")).toBe(50);
  });

  it("rejects half-typed and exotic input", () => {
    for (const bad of ["", "  ", "-", "+", ".", "5.", "abc", "1e3", "−5", "NaN"]) {
      expect(() => parseDollars(bad), bad).toThrow();
    }
  });

  it("refuses amounts past exact integer arithmetic (§1 integer-cents rule)", () => {
    expect(() => parseDollars("99999999999999999999.99")).toThrow();
    expect(() => cents(1e20)).toThrow();
    expect(cents(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("never yields -0", () => {
    expect(Object.is(parseDollars("-0"), 0)).toBe(true);
    expect(Object.is(parseDollars("-0.00"), 0)).toBe(true);
  });

  it("truncates sub-cent precision rather than throwing", () => {
    expect(parseDollars("0.0000001")).toBe(0);
    expect(parseDollars("1.005")).toBe(101); // documented half-up rounding
  });
});

describe("formatCents — display edges", () => {
  it("renders -0 as a plain zero", () => {
    expect(formatCents(-0)).toBe("$0.00");
    expect(formatCents(0)).toBe("$0.00");
  });

  it("groups large values", () => {
    expect(formatCents(100000000000000)).toBe("$1,000,000,000,000.00");
  });
});
