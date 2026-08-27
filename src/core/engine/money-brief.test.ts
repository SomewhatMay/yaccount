import { describe, expect, it } from "vitest";
import {
  makeContainer,
  makeContainerSnapshot,
  makeRecurringRule,
  makeTransaction,
} from "@/core/model";
import type { BudgetTriage, BudgetTriageRow } from "./budget-triage";
import type { CashHorizon } from "./cash-horizon";
import { moneyBrief } from "./money-brief";

function row(
  categoryId: string,
  name: string,
  status: BudgetTriageRow["status"],
  values: Partial<BudgetTriageRow> = {},
): BudgetTriageRow {
  return {
    categoryId,
    name,
    budget: 50_000,
    spent: 45_000,
    remaining: 5_000,
    elapsedDays: 23,
    daysInMonth: 31,
    monthElapsedPct: 23 / 31,
    spentPct: 0.9,
    linearProjection: 60_652,
    scheduledRemaining: 0,
    scheduled: [],
    projected: 60_652,
    status,
    ...values,
  };
}

function triage(rows: BudgetTriageRow[]): BudgetTriage {
  return {
    yearMonth: "2026-08",
    start: "2026-08-01",
    end: "2026-08-31",
    elapsedDays: 23,
    daysInMonth: 31,
    rows,
    counts: {
      needsAttention: rows.filter(
        (candidate) => candidate.status === "spent" || candidate.status === "projected",
      ).length,
      watch: rows.filter((candidate) => candidate.status === "watch").length,
      onTrack: rows.filter((candidate) => candidate.status === "on-track").length,
    },
  };
}

function horizon(options: Partial<CashHorizon> = {}): CashHorizon {
  return {
    start: "2026-08-23",
    end: "2026-09-22",
    days: 30,
    containerIds: ["general"],
    startingBalance: 20_000,
    projectedBalance: 20_000,
    low: { balance: 20_000, date: "2026-08-23" },
    firstBelowZero: null,
    largestShortfall: 0,
    nextIncome: null,
    billsBeforeNextIncome: { count: 0, amount: 0 },
    events: [],
    unknownEvents: [],
    ...options,
  };
}

describe("moneyBrief", () => {
  it("ranks cash risk, pending review, budgets, then stale values and caps at three", () => {
    const investment = makeContainer({
      id: "brokerage",
      name: "Brokerage",
      is_investment: true,
    });
    const cash = horizon({
      projectedBalance: -10_000,
      low: { balance: -10_000, date: "2026-08-25" },
      firstBelowZero: { balance: -10_000, date: "2026-08-25" },
      largestShortfall: 10_000,
      events: [
        {
          id: "power:2026-08-25",
          date: "2026-08-25",
          label: "Power",
          amount: -30_000,
          balanceAfter: -10_000,
          kind: "expense",
          source: "recurring",
          ruleId: "power",
          transactionId: null,
        },
      ],
    });
    const result = moneyBrief({
      today: "2026-08-23",
      ledgerTransactions: [
        makeTransaction({
          id: "pending-hidden",
          date: "2026-08-23",
          amount: -1_000,
          vendor_source: "Pending one",
          category_id: "hidden",
          inbox_status: "pending",
        }),
        makeTransaction({
          id: "pending-two",
          date: "2026-08-23",
          amount: 2_000,
          vendor_source: "Pending two",
          category_id: "income",
          inbox_status: "pending",
        }),
      ],
      containers: [investment],
      snapshots: [
        makeContainerSnapshot({
          id: "old-value",
          container_id: investment.id,
          date: "2026-07-01",
          reported_balance: 100_000,
        }),
      ],
      recurringRules: [],
      budgetTriage: triage([
        row("food", "Groceries", "spent", {
          spent: 56_400,
          remaining: -6_400,
          projected: 56_400,
        }),
        row("fuel", "Fuel", "projected"),
      ]),
      cashHorizon: cash,
    });

    expect(result.totalItems).toBe(5);
    expect(result.items.map((item) => item.kind)).toEqual([
      "cash-risk",
      "pending",
      "budget",
    ]);
    expect(result.items[0]).toMatchObject({
      date: "2026-08-25",
      shortfall: 10_000,
      action: { screen: "recurring", focusId: "power" },
    });
    expect(result.items[1]).toMatchObject({
      count: 2,
      action: { screen: "inbox", focusId: null },
    });
    expect(result.items[2]).toMatchObject({
      categoryId: "food",
      status: "spent",
      action: { screen: "categories", focusId: "food" },
    });
    expect(result.hiddenItemCount).toBe(2);
  });

  it("does not turn an ordinary known bill into an attention item", () => {
    const bill = {
      id: "power:2026-08-28",
      date: "2026-08-28",
      label: "Power",
      amount: -11_800,
      balanceAfter: 8_200,
      kind: "expense" as const,
      source: "recurring" as const,
      ruleId: "power",
      transactionId: null,
    };
    const result = moneyBrief({
      today: "2026-08-23",
      ledgerTransactions: [],
      containers: [],
      snapshots: [],
      recurringRules: [
        makeRecurringRule({
          id: "power",
          frequency: "monthly",
          interval_config: { day_of_month: 28 },
          template_amount: -11_800,
          template_vendor_source: "Power",
          template_category_id: "utilities",
          template_container_id: "general",
          start_date: "2026-01-01",
        }),
      ],
      budgetTriage: triage([row("food", "Groceries", "on-track")]),
      cashHorizon: horizon({
        projectedBalance: 8_200,
        low: { balance: 8_200, date: "2026-08-28" },
        events: [bill],
      }),
    });

    expect(result.items).toEqual([]);
    expect(result.nextKnownBill).toEqual({
      date: "2026-08-28",
      label: "Power",
      amount: -11_800,
    });
    expect(result.hasScheduledContext).toBe(true);
  });

  it("treats 30-day investment values as current and 31-day values as stale", () => {
    const current = makeContainer({
      id: "current",
      name: "Current fund",
      is_investment: true,
    });
    const stale = makeContainer({
      id: "stale",
      name: "Stale fund",
      is_investment: true,
    });
    const missing = makeContainer({
      id: "missing",
      name: "Missing fund",
      is_investment: true,
    });
    const result = moneyBrief({
      today: "2026-08-23",
      ledgerTransactions: [],
      containers: [current, stale, missing],
      snapshots: [
        makeContainerSnapshot({
          id: "current-value",
          container_id: current.id,
          date: "2026-07-24",
          reported_balance: 100,
        }),
        makeContainerSnapshot({
          id: "stale-value",
          container_id: stale.id,
          date: "2026-07-23",
          reported_balance: 100,
        }),
      ],
      recurringRules: [],
      budgetTriage: triage([]),
      cashHorizon: horizon(),
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        kind: "stale-values",
        staleCount: 1,
        missingCount: 1,
        oldestAgeDays: 31,
        action: { screen: "containers", focusId: null },
      }),
    ]);
    expect(result.hasScheduledContext).toBe(false);
  });
});
