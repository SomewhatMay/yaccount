import { describe, it, expect } from "vitest";
import { budgetOnDate } from "./budgets";
import { makeBudgetTarget } from "@/core/model";

describe("budgetOnDate — time-variant resolution (§5.3)", () => {
  const rows = [
    makeBudgetTarget({
      category_id: "groceries",
      amount: 30000,
      start_date: "2026-01-01",
    }),
    makeBudgetTarget({
      category_id: "groceries",
      amount: 60000,
      start_date: "2026-06-01",
    }),
  ];

  it("resolves a permanent shift: the row effective ≤ the date wins", () => {
    expect(budgetOnDate(rows, "groceries", "2026-03-15")).toBe(30000);
    expect(budgetOnDate(rows, "groceries", "2026-07-01")).toBe(60000);
  });

  it("is exact on the boundary start_date", () => {
    expect(budgetOnDate(rows, "groceries", "2026-06-01")).toBe(60000);
    expect(budgetOnDate(rows, "groceries", "2026-05-31")).toBe(30000);
  });

  it("returns null before any row takes effect", () => {
    expect(budgetOnDate(rows, "groceries", "2025-12-31")).toBeNull();
  });

  it("returns null for a category with no budget rows", () => {
    expect(budgetOnDate(rows, "rent", "2026-07-01")).toBeNull();
  });

  it("a one-off elevated month reverts once a following row exists", () => {
    const oneOff = [
      makeBudgetTarget({ category_id: "car", amount: 10000, start_date: "2026-01-01" }),
      makeBudgetTarget({ category_id: "car", amount: 120000, start_date: "2026-06-01" }), // insurance month
      makeBudgetTarget({ category_id: "car", amount: 10000, start_date: "2026-07-01" }), // reverts
    ];
    expect(budgetOnDate(oneOff, "car", "2026-05-01")).toBe(10000);
    expect(budgetOnDate(oneOff, "car", "2026-06-15")).toBe(120000);
    expect(budgetOnDate(oneOff, "car", "2026-07-15")).toBe(10000);
  });

  it("ignores rows for other categories", () => {
    const mixed = [
      makeBudgetTarget({
        category_id: "groceries",
        amount: 30000,
        start_date: "2026-01-01",
      }),
      makeBudgetTarget({ category_id: "rent", amount: 200000, start_date: "2026-01-01" }),
    ];
    expect(budgetOnDate(mixed, "groceries", "2026-03-01")).toBe(30000);
    expect(budgetOnDate(mixed, "rent", "2026-03-01")).toBe(200000);
  });

  it("is unaffected by input order (sorts before resolving)", () => {
    const shuffled = [rows[1], rows[0]];
    expect(budgetOnDate(shuffled, "groceries", "2026-03-15")).toBe(30000);
  });
});
