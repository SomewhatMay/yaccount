import { describe, it, expect } from "vitest";
import { makeCategory } from "../model/category";
import { makeBudgetTarget } from "../model/budgetTarget";
import { makeTransaction, makeVoidRow, makeTransfer } from "../model/transaction";
import type { Category, Transaction } from "../model";
import {
  categoryBreakdown,
  categoryBreakdownMonthlyAverage,
  categoryTrendSeries,
  comparePeriodSummary,
  dailySpend,
  largestTransactions,
  monthlyTotals,
  categoryMonthlySpend,
  periodSummary,
  sankeyFlows,
  savingsRateSeries,
  statsTransactions,
  topPayees,
  waterfallData,
  budgetComparison,
  totalExpenseBudgetOnDate,
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

describe("statsTransactions — category statistical exclusion", () => {
  it("drops excluded category rows and preserves every other row shape", () => {
    const hidden = {
      ...makeCategory({ id: "hidden", name: "Hidden", type: "expense" }),
      excluded_from_stats: true,
    };
    const oldRecord = {
      id: "old",
      name: "Old record",
      type: "expense",
      is_archived: false,
      color: null,
      icon: null,
    } as Category;
    const included = makeCategory({ id: "included", name: "Included", type: "expense" });
    const hiddenRow = makeTransaction({
      id: "hidden-row",
      date: "2026-07-01",
      amount: -1000,
      vendor_source: "Hidden expense",
      category_id: hidden.id,
    });
    const includedRow = makeTransaction({
      id: "included-row",
      date: "2026-07-01",
      amount: -2000,
      vendor_source: "Included expense",
      category_id: included.id,
    });
    const oldRow = makeTransaction({
      id: "old-row",
      date: "2026-07-01",
      amount: -3000,
      vendor_source: "Old expense",
      category_id: oldRecord.id,
    });
    const transfer = makeTransfer({
      id: "transfer",
      date: "2026-07-01",
      amount: 4000,
      container_id: "general",
      to_container_id: "savings",
      fromName: "General",
      toName: "Savings",
    });
    const uncategorized = { ...includedRow, id: "uncategorized", category_id: null };

    expect(
      statsTransactions(
        [hiddenRow, includedRow, oldRow, transfer, uncategorized],
        [hidden, included, oldRecord],
      ).map((row) => row.id),
    ).toEqual(["included-row", "old-row", "transfer", "uncategorized"]);
  });
});

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

describe("totalExpenseBudgetOnDate — monthly-bar budget overlay", () => {
  it("sums every expense category's budget in effect, income cats ignored", () => {
    const bts = [
      makeBudgetTarget({ category_id: "groc", amount: 10000, start_date: "2026-01-01" }),
      makeBudgetTarget({
        category_id: "dining",
        amount: 20000,
        start_date: "2026-03-01",
      }),
    ];
    expect(totalExpenseBudgetOnDate(bts, categories, "2026-02-15")).toBe(10000); // dining not yet in effect
    expect(totalExpenseBudgetOnDate(bts, categories, "2026-05-01")).toBe(30000);
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

// ── M11: the dashboard-v2 derivations ───────────────────────────────────────

describe("periodSummary — the KPI strip's four numbers (M11)", () => {
  it("sums in, out and what was kept; the rate is a fraction of income", () => {
    expect(periodSummary(txns, categories, range)).toEqual({
      income: 1500000,
      expense: 45000,
      saved: 1455000,
      savingsRate: 0.97,
    });
  });

  it("has no savings rate without income — nothing to take a share OF", () => {
    // Jun 5 … Jun 30 skips the Jun 1 paycheck: spending, no earning.
    expect(
      periodSummary(txns, categories, { start: "2026-06-05", end: "2026-06-30" }),
    ).toEqual({ income: 0, expense: 15000, saved: -15000, savingsRate: null });
    expect(periodSummary([], categories, range)).toEqual({
      income: 0,
      expense: 0,
      saved: 0,
      savingsRate: null,
    });
  });

  it("counts an overspent window as a negative saving, not a zero", () => {
    const s = periodSummary(
      [
        makeTransaction({
          date: "2026-07-02",
          amount: 10000,
          vendor_source: "Work",
          category_id: "salary",
        }),
        makeTransaction({
          date: "2026-07-03",
          amount: -25000,
          vendor_source: "Mart",
          category_id: "groc",
        }),
      ],
      categories,
      { start: "2026-07-01", end: "2026-07-31" },
    );
    expect(s).toEqual({
      income: 10000,
      expense: 25000,
      saved: -15000,
      savingsRate: -1.5,
    });
  });
});

describe("comparePeriodSummary — Δ against the equivalent window before (M11)", () => {
  const current = { income: 1000000, expense: 600000, saved: 400000, savingsRate: 0.4 };
  const previous = { income: 800000, expense: 600000, saved: 200000, savingsRate: 0.25 };

  it("percent change per figure, and POINTS for the rate", () => {
    const d = comparePeriodSummary(current, previous);
    expect(d.incomePct).toBe(25);
    expect(d.expensePct).toBe(0);
    expect(d.savedPct).toBe(100);
    // A rate moves in points, never in percent: 25% → 40% is +15 points.
    expect(d.ratePoints).toBeCloseTo(15, 10);
  });

  it("measures against the SIZE of the previous figure, so a deficit shrinking reads as a gain", () => {
    const worse = { income: 100, expense: 300, saved: -200, savingsRate: -2 };
    const better = { income: 100, expense: 200, saved: -100, savingsRate: -1 };
    expect(comparePeriodSummary(better, worse).savedPct).toBe(50);
  });

  it("has no percentage against nothing", () => {
    const zero = { income: 0, expense: 0, saved: 0, savingsRate: null };
    expect(comparePeriodSummary(current, zero)).toEqual({
      incomePct: null,
      expensePct: null,
      savedPct: null,
      ratePoints: null,
    });
  });
});

describe("dailySpend — the calendar heatmap's days (M11)", () => {
  it("one entry per day that has outflow, ascending, voids and transfers gone", () => {
    expect(dailySpend(txns, categories, range)).toEqual([
      { date: "2026-05-10", amount: 30000 },
      { date: "2026-06-10", amount: 20000 },
      { date: "2026-06-20", amount: -5000 }, // a refund day: money came back
    ]);
  });

  it("nets a refund against a purchase on the same day, and drops the day when it cancels", () => {
    const sameDay = [
      makeTransaction({
        date: "2026-07-04",
        amount: -8000,
        vendor_source: "Mart",
        category_id: "groc",
      }),
      makeTransaction({
        date: "2026-07-04",
        amount: 8000,
        vendor_source: "Mart refund",
        category_id: "groc",
      }),
    ];
    expect(
      dailySpend(sameDay, categories, { start: "2026-07-01", end: "2026-07-31" }),
    ).toEqual([]);
  });
});

describe("topPayees — who the money went to (M11)", () => {
  it("groups by payee over spending only, biggest first", () => {
    expect(topPayees(txns, categories, range, 5)).toEqual([
      { payee: "Mart", amount: 50000, count: 2 },
    ]);
  });

  it("treats one payee spelled two ways as one, keeping the spelling with the most money", () => {
    const mixed = [
      makeTransaction({
        date: "2026-07-02",
        amount: -10000,
        vendor_source: "Costco",
        category_id: "groc",
      }),
      makeTransaction({
        date: "2026-07-03",
        amount: -30000,
        vendor_source: "costco ",
        category_id: "groc",
      }),
    ];
    expect(
      topPayees(mixed, categories, { start: "2026-07-01", end: "2026-07-31" }),
    ).toEqual([{ payee: "costco", amount: 40000, count: 2 }]);
  });

  it("honours the limit", () => {
    const many = ["A", "B", "C"].map((p, i) =>
      makeTransaction({
        date: "2026-07-02",
        amount: -(i + 1) * 1000,
        vendor_source: p,
        category_id: "groc",
      }),
    );
    expect(
      topPayees(many, categories, { start: "2026-07-01", end: "2026-07-31" }, 2).map(
        (p) => p.payee,
      ),
    ).toEqual(["C", "B"]);
  });
});

describe("largestTransactions — the entries that moved the needle (M11)", () => {
  it("ranks by SIZE across income and expense, transfers excluded", () => {
    const top = largestTransactions(txns, range, 4);
    expect(top.map((t) => t.amount)).toEqual([500000, 500000, 500000, -30000]);
    // Ties keep register order (newest first), so two devices agree (§8.5).
    expect(top.map((t) => t.date)).toEqual([
      "2026-07-01",
      "2026-06-01",
      "2026-05-01",
      "2026-05-10",
    ]);
  });

  it("never surfaces a voided entry", () => {
    expect(largestTransactions(txns, range, 20).some((t) => t.id === "v-orig")).toBe(
      false,
    );
  });
});

describe("savingsRateSeries — the share kept, month by month (M11)", () => {
  it("is null in a month with no income, not zero", () => {
    expect(savingsRateSeries(monthlyTotals(txns, categories, range))).toEqual([
      { month: "2026-04", rate: null },
      { month: "2026-05", rate: 0.94 },
      { month: "2026-06", rate: 0.97 },
      { month: "2026-07", rate: 1 },
    ]);
  });
});

describe("categoryTrendSeries — the sparkline beside each breakdown row (M11)", () => {
  it("carries a value per month of the window, in breakdown order", () => {
    expect(categoryTrendSeries(txns, categories, range, { type: "expense" })).toEqual([
      {
        categoryId: "groc",
        name: "Groceries",
        amount: 45000,
        series: [0, 30000, 15000, 0], // Apr, May, Jun, Jul
      },
    ]);
  });

  it("does the same for income", () => {
    expect(categoryTrendSeries(txns, categories, range, { type: "income" })).toEqual([
      {
        categoryId: "salary",
        name: "Salary",
        amount: 1500000,
        series: [0, 500000, 500000, 500000],
      },
    ]);
  });
});

describe("sankeyFlows — where the money came from and went (M11)", () => {
  it("funnels every income category through one hub, out to expenses and what was kept", () => {
    expect(sankeyFlows(txns, categories, range)).toEqual({
      nodes: [
        { id: "salary", name: "Salary", kind: "income" },
        { id: null, name: "All income", kind: "hub" },
        { id: "groc", name: "Groceries", kind: "expense" },
        { id: null, name: "Saved", kind: "saved" },
      ],
      links: [
        { source: 0, target: 1, value: 1500000 },
        { source: 1, target: 2, value: 45000 },
        { source: 1, target: 3, value: 1455000 },
      ],
    });
  });

  it("shows an overspend as money drawn INTO the hub, so the picture still balances", () => {
    const overspent = [
      makeTransaction({
        date: "2026-07-02",
        amount: 100000,
        vendor_source: "Work",
        category_id: "salary",
      }),
      makeTransaction({
        date: "2026-07-03",
        amount: -150000,
        vendor_source: "Mart",
        category_id: "groc",
      }),
    ];
    expect(
      sankeyFlows(overspent, categories, { start: "2026-07-01", end: "2026-07-31" }),
    ).toEqual({
      nodes: [
        { id: "salary", name: "Salary", kind: "income" },
        { id: null, name: "Savings", kind: "drawdown" },
        { id: null, name: "All income", kind: "hub" },
        { id: "groc", name: "Groceries", kind: "expense" },
      ],
      links: [
        { source: 0, target: 2, value: 100000 },
        { source: 1, target: 2, value: 50000 },
        { source: 2, target: 3, value: 150000 },
      ],
    });
  });

  it("folds the tail into one Other strand rather than growing hairs", () => {
    const cats = [
      salary,
      ...["a", "b", "c"].map((id) =>
        makeCategory({ name: id.toUpperCase(), type: "expense", id }),
      ),
    ];
    const rows = [
      makeTransaction({
        date: "2026-07-01",
        amount: 100000,
        vendor_source: "Work",
        category_id: "salary",
      }),
      ...["a", "b", "c"].map((id, i) =>
        makeTransaction({
          date: "2026-07-02",
          amount: -(3 - i) * 1000,
          vendor_source: "x",
          category_id: id,
        }),
      ),
    ];
    const flows = sankeyFlows(
      rows,
      cats,
      { start: "2026-07-01", end: "2026-07-31" },
      { limit: 2 },
    );
    // `limit` caps the STRANDS on a side, Other included — so two strands here:
    // the biggest category, and everything else gathered behind it.
    expect(flows.nodes.map((n) => n.name)).toEqual([
      "Salary",
      "All income",
      "A",
      "Other",
      "Saved",
    ]);
    const other = flows.nodes.findIndex((n) => n.name === "Other");
    expect(flows.links.find((l) => l.target === other)?.value).toBe(3000); // B + C
  });

  it("has nothing to draw when the window is empty", () => {
    expect(sankeyFlows([], categories, range)).toEqual({ nodes: [], links: [] });
  });
});
