import { describe, it, expect } from "vitest";
import { budgetOnDate, budgetPace } from "./budgets";
import {
  makeBudgetTarget,
  makeCategory,
  makeTransaction,
  makeTransfer,
} from "@/core/model";

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

// ── M11: budget pace — am I spending faster than the month is passing? ────────
describe("budgetPace — spend against the month's own clock (M11)", () => {
  const groc = makeCategory({ name: "Groceries", type: "expense", id: "groc" });
  const salary = makeCategory({ name: "Salary", type: "income", id: "salary" });
  const cats = [groc, salary];
  const targets = [
    makeBudgetTarget({ category_id: "groc", amount: 40000, start_date: "2026-01-01" }),
  ];
  const june = [
    makeTransaction({
      date: "2026-06-05",
      amount: -20000,
      vendor_source: "Mart",
      category_id: "groc",
    }),
    makeTransaction({
      date: "2026-06-12",
      amount: -5000,
      vendor_source: "Mart",
      category_id: "groc",
    }),
    // Neither of these is spending: income, and money moved between own containers.
    makeTransaction({
      date: "2026-06-02",
      amount: 300000,
      vendor_source: "Work",
      category_id: "salary",
    }),
    makeTransfer({
      date: "2026-06-03",
      amount: 100000,
      container_id: "general",
      to_container_id: "savings",
      fromName: "General",
      toName: "Savings",
    }),
  ];

  it("projects the month from how much of it has passed", () => {
    // Jun 15 of 30 → half the month gone, $250 of a $400 allowance spent.
    expect(budgetPace(june, cats, targets, "2026-06", "2026-06-15")).toEqual({
      spent: 25000,
      budget: 40000,
      remaining: 15000,
      monthElapsedPct: 0.5,
      spentPct: 0.625,
      projected: 50000,
      onPace: false,
      daysLeft: 15,
    });
  });

  it("is on pace when the projection lands inside the allowance", () => {
    // Same $250 spent, but five sixths of the month gone → it will land at $300.
    const early = budgetPace(june, cats, targets, "2026-06", "2026-06-25");
    expect(early.monthElapsedPct).toBeCloseTo(25 / 30, 10);
    expect(early.projected).toBe(30000);
    expect(early.onPace).toBe(true);
    expect(early.daysLeft).toBe(5);
  });

  it("a finished month projects itself — nothing more can be spent", () => {
    const done = budgetPace(june, cats, targets, "2026-06", "2026-07-09");
    expect(done.monthElapsedPct).toBe(1);
    expect(done.projected).toBe(25000);
    expect(done.daysLeft).toBe(0);
    expect(done.onPace).toBe(true);
  });

  it("a month not yet begun has nothing to extrapolate from — it projects what is booked", () => {
    const ahead = budgetPace(june, cats, targets, "2026-06", "2026-05-20");
    expect(ahead.monthElapsedPct).toBe(0);
    expect(ahead.spent).toBe(25000); // already-dated rows still count
    expect(ahead.projected).toBe(25000); // dividing by zero elapsed would be a lie
    expect(ahead.daysLeft).toBe(30);
    expect(ahead.onPace).toBe(true);
  });

  it("without a budget there is no pace to keep, only a figure", () => {
    const none = budgetPace(june, cats, [], "2026-06", "2026-06-15");
    expect(none.budget).toBe(0);
    expect(none.spentPct).toBeNull();
    expect(none.onPace).toBe(false); // money went out against nothing set aside
    expect(budgetPace([], cats, [], "2026-06", "2026-06-15").onPace).toBe(true);
  });

  it("uses the allowance in effect for the month, not last year's", () => {
    const raised = [
      ...targets,
      makeBudgetTarget({ category_id: "groc", amount: 60000, start_date: "2026-06-10" }),
    ];
    expect(budgetPace(june, cats, raised, "2026-06", "2026-06-15").budget).toBe(60000);
    expect(budgetPace(june, cats, raised, "2026-05", "2026-06-15").budget).toBe(40000);
  });
});
