import { describe, it, expect } from "vitest";
import { makeBudgetTarget } from "./budgetTarget";

describe("makeBudgetTarget (§5.3 — time-variant, no end_date)", () => {
  const base = { category_id: "c1", amount: 30000, start_date: "2026-01-01" };

  it("builds a row in integer cents", () => {
    const b = makeBudgetTarget(base);
    expect(b.category_id).toBe("c1");
    expect(b.amount).toBe(30000);
    expect(b.start_date).toBe("2026-01-01");
  });

  it("mints an id when none is given", () => {
    expect(makeBudgetTarget(base).id.length).toBeGreaterThan(0);
  });

  it("rejects a negative amount and a non-integer amount", () => {
    expect(() => makeBudgetTarget({ ...base, amount: -1 })).toThrow();
    expect(() => makeBudgetTarget({ ...base, amount: 12.5 })).toThrow();
  });

  it("rejects a date that is not a real calendar day", () => {
    expect(() => makeBudgetTarget({ ...base, start_date: "2026-02-30" })).toThrow();
  });
});
