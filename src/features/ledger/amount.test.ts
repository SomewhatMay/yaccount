import { describe, it, expect } from "vitest";
import { resolveAmount, splitSign } from "./amount";

describe("resolveAmount — the soft sign rule (§5.4 / §10 #13)", () => {
  it("auto-signs a bare magnitude by category type", () => {
    expect(resolveAmount("10", "expense")).toEqual({
      ok: true,
      signed: -1000,
      unusual: false,
    });
    expect(resolveAmount("10", "income")).toEqual({
      ok: true,
      signed: 1000,
      unusual: false,
    });
  });

  it("honors an explicit sign the user typed", () => {
    expect(resolveAmount("+10", "expense")).toEqual({
      ok: true,
      signed: 1000,
      unusual: true, // a refund/rebate on an expense category — allowed, flagged
    });
    expect(resolveAmount("-10", "income")).toEqual({
      ok: true,
      signed: -1000,
      unusual: true,
    });
  });

  it("lets an explicit sign argument (the visible +/− control) win", () => {
    // Money IN on an expense category = a refund or rebate. Allowed, flagged.
    expect(resolveAmount("10", "expense", "+")).toEqual({
      ok: true,
      signed: 1000,
      unusual: true,
    });
    // …and it beats a stale sign left in the text field.
    expect(resolveAmount("-10", "expense", "+")).toEqual({
      ok: true,
      signed: 1000,
      unusual: true,
    });
    expect(resolveAmount("+10", "income", "-")).toEqual({
      ok: true,
      signed: -1000,
      unusual: true,
    });
  });

  it("a normal sign for the category is never flagged", () => {
    expect(resolveAmount("10", "expense", "-")).toMatchObject({ unusual: false });
    expect(resolveAmount("10", "income", "+")).toMatchObject({ unusual: false });
  });

  it("rejects zero and unparseable input", () => {
    expect(resolveAmount("0", "expense").ok).toBe(false);
    expect(resolveAmount("abc", "expense").ok).toBe(false);
  });
});

describe("splitSign — keep the sign in the control, the magnitude in the field", () => {
  it("pulls a typed leading sign out of the text", () => {
    expect(splitSign("-10.50")).toEqual({ sign: "-", rest: "10.50" });
    expect(splitSign("+10.50")).toEqual({ sign: "+", rest: "10.50" });
    expect(splitSign(" -10")).toEqual({ sign: "-", rest: "10" });
  });

  it("leaves an unsigned amount alone", () => {
    expect(splitSign("10.50")).toEqual({ sign: null, rest: "10.50" });
    expect(splitSign("")).toEqual({ sign: null, rest: "" });
  });
});

describe("resolveAmount — garbage in, error out", () => {
  it("rejects a sign with no number behind it", () => {
    for (const bad of ["-", "+", ".", "   ", ""]) {
      expect(resolveAmount(bad, "expense").ok, bad).toBe(false);
    }
  });

  it("rejects doubled signs instead of guessing", () => {
    // "--10" used to resolve to -$10 and "+-10" to +$10.
    expect(resolveAmount("--10", "expense").ok).toBe(false);
    expect(resolveAmount("+-10", "expense").ok).toBe(false);
  });

  it("errors on an unparseable body even when a sign argument is given", () => {
    expect(resolveAmount("abc", "expense", "+").ok).toBe(false);
  });

  it("keeps the money.ts tolerances through the sign split", () => {
    expect(resolveAmount("-.5", "expense")).toMatchObject({ signed: -50 });
    expect(resolveAmount("-$10", "expense")).toMatchObject({ signed: -1000 });
    expect(resolveAmount(" + 10", "expense")).toMatchObject({ signed: 1000 });
    expect(resolveAmount("1,000", "income")).toMatchObject({ signed: 100000 });
    expect(resolveAmount("10.005", "expense")).toMatchObject({ signed: -1001 });
  });

  it("treats every spelling of zero as zero", () => {
    expect(resolveAmount("0.00", "expense").ok).toBe(false);
    expect(resolveAmount("-0", "expense").ok).toBe(false);
  });

  it("splitSign returns a trimmed body either way", () => {
    expect(splitSign("  10 ")).toEqual({ sign: null, rest: "10" });
    expect(splitSign(" -10 ")).toEqual({ sign: "-", rest: "10" });
    expect(splitSign("   ")).toEqual({ sign: null, rest: "" });
  });
});
