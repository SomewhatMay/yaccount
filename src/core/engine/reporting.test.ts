import { describe, it, expect } from "vitest";
import { makeCategory } from "../model/category";
import { makeBudgetTarget } from "../model/budgetTarget";
import { makeTransaction, makeVoidRow, makeTransfer } from "../model/transaction";
import type { Transaction } from "../model";
import {
  categoryBreakdown,
  categoryBreakdownMonthlyAverage,
  monthlyTotals,
  categoryMonthlySpend,
  waterfallData,
  budgetComparison,
} from "./reporting";
import { resolvePeriod } from "./period";

// ── Fixture (all amounts integer cents, signed) ─────────────────────────────
const groceries = makeCategory({ name: "Groceries", type: "expense", id: "groc" });
const dining = makeCategory({ name: "Dining", type: "expense", id: "dining" });
const salary = makeCategory({ name: "Salary", type: "income", id: "salary" });
const categories = [groceries, dining, salary];

const budgetTargets = [
  makeBudgetTarget({ category_id: "groc", amount: 10000, start_date: "2026-01-01" }),
];

const voided = makeTransaction({
  date: "2026-05-15",
  amount: -10000,
  vendor_source: "Ghost",
  category_id: "groc",
  id: "v-orig",
});

const txns: Transaction[] = [
  // income
  makeTransaction({
    date: "2026-05-01",
    amount: 500000,
    vendor_source: "Work",
    category_id: "salary",
  }),
  makeTransaction({
    date: "2026-06-01",
    amount: 500000,
    vendor_source: "Work",
    category_id: "salary",
  }),
  makeTransaction({
    date: "2026-07-01",
    amount: 500000,
    vendor_source: "Work",
    category_id: "salary",
  }),
  // groceries: -300 (May), a voided -100 (May), -200 (Jun), +50 refund (Jun)
  makeTransaction({
    date: "2026-05-10",
    amount: -30000,
    vendor_source: "Mart",
    category_id: "groc",
  }),
  voided,
  makeVoidRow(voided, { id: "v-rev" }),
  makeTransaction({
    date: "2026-06-10",
    amount: -20000,
    vendor_source: "Mart",
    category_id: "groc",
  }),
  makeTransaction({
    date: "2026-06-20",
    amount: 5000,
    vendor_source: "Mart refund",
    category_id: "groc",
  }),
  // a transfer — must never appear in category charts
  makeTransfer({
    date: "2026-05-05",
    amount: 100000,
    container_id: "general",
    to_container_id: "savings",
    fromName: "General",
    toName: "Savings",
  }),
];

const range = resolvePeriod({ kind: "preset", preset: "last-3-months" }, "2026-07-21");
// → 2026-04-21 … 2026-07-21 ; month keys Apr, May, Jun, Jul (4)

describe("categoryBreakdown — signed-sum, zero-filtered, transfer-free (§6.4)", () => {
  it("nets the void pair and the refund; excludes the transfer and empty categories", () => {
    expect(categoryBreakdown(txns, categories, range, { type: "expense" })).toEqual([
      { categoryId: "groc", name: "Groceries", amount: 45000 }, // 300 + 200 − 50 refund
    ]);
  });

  it("income breakdown sums the income-type category", () => {
    expect(categoryBreakdown(txns, categories, range, { type: "income" })).toEqual([
      { categoryId: "salary", name: "Salary", amount: 1500000 },
    ]);
  });

  it("monthly-average variant divides by the window's month count (÷4)", () => {
    expect(
      categoryBreakdownMonthlyAverage(txns, categories, range, { type: "expense" }),
    ).toEqual([{ categoryId: "groc", name: "Groceries", amount: 11250 }]);
  });
});

describe("monthlyTotals — income/expense/savings per month (transfers excluded)", () => {
  it("includes empty months and nets refunds/voids", () => {
    expect(monthlyTotals(txns, categories, range)).toEqual([
      { month: "2026-04", income: 0, expense: 0, savings: 0 },
      { month: "2026-05", income: 500000, expense: 30000, savings: 470000 },
      { month: "2026-06", income: 500000, expense: 15000, savings: 485000 },
      { month: "2026-07", income: 500000, expense: 0, savings: 500000 },
    ]);
  });
});

describe("categoryMonthlySpend — one category vs. its time-variant budget", () => {
  it("spend per month with the budget resolved at each month", () => {
    expect(categoryMonthlySpend(txns, "groc", range, budgetTargets)).toEqual([
      { month: "2026-04", spend: 0, budget: 10000 },
      { month: "2026-05", spend: 30000, budget: 10000 },
      { month: "2026-06", spend: 15000, budget: 10000 },
      { month: "2026-07", spend: 0, budget: 10000 },
    ]);
  });
});

describe("waterfallData — Income → Expenses → Savings", () => {
  it("collapses the monthly series to period totals", () => {
    expect(waterfallData(monthlyTotals(txns, categories, range))).toEqual({
      income: 1500000,
      expenses: 45000,
      savings: 1455000,
    });
  });
});

describe("budgetComparison — actual monthly-average vs. active-period budget (§6.3)", () => {
  it("computes delta% against the budget in effect", () => {
    expect(budgetComparison(txns, categories, range, budgetTargets)).toEqual([
      {
        categoryId: "groc",
        name: "Groceries",
        actualMonthlyAvg: 11250, // 45000 / 4
        budget: 10000,
        deltaPct: 12.5,
      },
    ]);
  });
});
