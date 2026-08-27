import { describe, expect, it } from "vitest";
import {
  makeBudgetTarget,
  makeCategory,
  makeContainer,
  makeContainerSnapshot,
  makeRecurringRule,
  makeTransaction,
  makeTransfer,
  makeVoidRow,
} from "@/core/model";
import { closeMonthKey, monthClose } from "./month-close";

const expense = makeCategory({ id: "expense", name: "Household", type: "expense" });
const otherExpense = makeCategory({
  id: "other-expense",
  name: "Other",
  type: "expense",
});
const income = makeCategory({ id: "income", name: "Income", type: "income" });
const categories = [expense, otherExpense, income];

function monthlyRule(id: string, day: number, amount: number, categoryId = expense.id) {
  return makeRecurringRule({
    id,
    frequency: "monthly",
    interval_config: { day_of_month: day },
    template_vendor_source: id,
    template_container_id: "general",
    template_category_id: categoryId,
    template_amount: amount,
    start_date: "2026-01-01",
  });
}

describe("closeMonthKey", () => {
  it("opens for the last three days and first five days around a month boundary", () => {
    expect(closeMonthKey("2026-07-28")).toBeNull();
    expect(closeMonthKey("2026-07-29")).toBe("2026-07");
    expect(closeMonthKey("2026-07-31")).toBe("2026-07");
    expect(closeMonthKey("2026-08-01")).toBe("2026-07");
    expect(closeMonthKey("2026-08-05")).toBe("2026-07");
    expect(closeMonthKey("2026-08-06")).toBeNull();
    expect(closeMonthKey("2028-03-01")).toBe("2028-02");
  });
});

describe("monthClose", () => {
  it("reports only provable open work for the month being closed", () => {
    const brokerage = makeContainer({
      id: "brokerage",
      name: "Brokerage",
      is_investment: true,
    });
    const power = monthlyRule("Power", 28, -11_800);
    const salary = monthlyRule("Salary", 30, 100_000, income.id);
    const cancelled = {
      ...monthlyRule("Cancelled", 20, -1_000),
      status: "cancelled" as const,
    };
    const transfer = makeRecurringRule({
      id: "Transfer",
      frequency: "monthly",
      interval_config: { day_of_month: 25 },
      template_vendor_source: "Transfer",
      template_container_id: "general",
      template_to_container_id: "savings",
      template_amount: 5_000,
      start_date: "2026-01-01",
    });
    const result = monthClose({
      today: "2026-08-02",
      transactions: [
        makeTransaction({
          id: "overspend",
          date: "2026-07-15",
          amount: -60_000,
          vendor_source: "Market",
          category_id: expense.id,
        }),
        makeTransaction({
          id: "power-paid",
          date: "2026-07-27",
          amount: -11_800,
          vendor_source: "Power paid",
          category_id: expense.id,
          recurring_rule_id: power.id,
          recurring_occurrence_date: "2026-07-28",
        }),
        makeTransaction({
          id: "salary-manual",
          date: "2026-07-29",
          amount: 100_000,
          vendor_source: "Salary deposit",
          category_id: income.id,
        }),
        makeTransaction({
          id: "salary-pending",
          date: "2026-07-30",
          amount: 100_000,
          vendor_source: "Salary",
          category_id: income.id,
          recurring_rule_id: salary.id,
          recurring_occurrence_date: "2026-07-30",
          inbox_status: "pending",
        }),
      ],
      categories,
      containers: [brokerage],
      snapshots: [
        makeContainerSnapshot({
          id: "old",
          container_id: brokerage.id,
          date: "2026-06-30",
          reported_balance: 100_000,
        }),
      ],
      budgetTargets: [
        makeBudgetTarget({
          category_id: expense.id,
          amount: 50_000,
          start_date: "2026-01-01",
        }),
      ],
      recurringRules: [power, salary, cancelled, transfer],
    });

    expect(result).toMatchObject({
      yearMonth: "2026-07",
      start: "2026-07-01",
      end: "2026-07-31",
      pendingCount: 1,
      completedTaskCount: 0,
      totalTaskCount: 4,
      staleValues: { staleCount: 1, missingCount: 0, oldestAgeDays: 33 },
    });
    expect(result!.overBudget).toEqual([
      {
        categoryId: expense.id,
        name: "Household",
        budget: 50_000,
        spent: 71_800,
        over: 21_800,
      },
    ]);
    expect(result!.unmatchedOccurrences).toEqual([
      expect.objectContaining({
        ruleId: salary.id,
        date: "2026-07-30",
        label: "Salary",
        amount: 100_000,
        pendingTransactionId: "salary-pending",
        candidates: [
          expect.objectContaining({
            transactionId: "salary-manual",
            date: "2026-07-29",
            label: "Salary deposit",
            amount: 100_000,
          }),
        ],
      }),
    ]);
  });

  it("offers exact-shape approved manual candidates within seven days without inferring a match", () => {
    const bill = monthlyRule("Power", 31, -1_000);
    const exact = makeTransaction({
      id: "exact",
      date: "2026-07-28",
      amount: -1_000,
      vendor_source: " power ",
      category_id: expense.id,
    });
    const otherName = makeTransaction({
      id: "other-name",
      date: "2026-07-31",
      amount: -1_000,
      vendor_source: "Utility company",
      category_id: expense.id,
    });
    const tooEarly = makeTransaction({
      id: "too-early",
      date: "2026-07-23",
      amount: -1_000,
      vendor_source: "Power",
      category_id: expense.id,
    });
    const wrongAmount = makeTransaction({
      id: "wrong-amount",
      date: "2026-07-31",
      amount: -999,
      vendor_source: "Power",
      category_id: expense.id,
    });
    const wrongCategory = makeTransaction({
      id: "wrong-category",
      date: "2026-07-31",
      amount: -1_000,
      vendor_source: "Power",
      category_id: otherExpense.id,
    });
    const pending = makeTransaction({
      id: "pending",
      date: "2026-07-31",
      amount: -1_000,
      vendor_source: "Power",
      category_id: expense.id,
      inbox_status: "pending",
    });
    const voided = makeTransaction({
      id: "voided",
      date: "2026-07-31",
      amount: -1_000,
      vendor_source: "Power",
      category_id: expense.id,
    });
    const result = monthClose({
      today: "2026-08-02",
      transactions: [
        exact,
        otherName,
        tooEarly,
        wrongAmount,
        wrongCategory,
        pending,
        voided,
        makeVoidRow(voided, { id: "void-row" }),
      ],
      categories,
      containers: [],
      snapshots: [],
      budgetTargets: [],
      recurringRules: [bill],
    })!;

    expect(result.unmatchedOccurrences).toHaveLength(1);
    expect(
      result.unmatchedOccurrences[0].candidates.map(
        (candidate) => candidate.transactionId,
      ),
    ).toEqual(["exact", "other-name"]);
    expect(result.completedTaskCount).toBe(2);
  });

  it("counts an explicit early manual association and an older generated row as matched", () => {
    const power = monthlyRule("Power", 31, -1_000);
    const salary = monthlyRule("Salary", 30, 10_000, income.id);
    const result = monthClose({
      today: "2026-08-02",
      transactions: [
        makeTransaction({
          id: "manual-linked",
          date: "2026-07-28",
          amount: -1_000,
          vendor_source: "Utility company",
          category_id: expense.id,
          recurring_rule_id: power.id,
          recurring_occurrence_date: "2026-07-31",
        }),
        makeTransaction({
          id: "old-generated",
          date: "2026-07-30",
          amount: 10_000,
          vendor_source: "Salary",
          category_id: income.id,
          recurring_rule_id: salary.id,
        }),
      ],
      categories,
      containers: [],
      snapshots: [],
      budgetTargets: [],
      recurringRules: [power, salary],
    })!;

    expect(result.unmatchedOccurrences).toEqual([]);
    expect(result.completedTaskCount).toBe(4);
  });

  it("does not call a future-reported investment value stale", () => {
    const brokerage = makeContainer({
      id: "brokerage",
      name: "Brokerage",
      is_investment: true,
    });
    const result = monthClose({
      today: "2026-08-02",
      transactions: [],
      categories,
      containers: [brokerage],
      snapshots: [
        makeContainerSnapshot({
          container_id: brokerage.id,
          date: "2026-09-15",
          reported_balance: 100_000,
        }),
      ],
      budgetTargets: [],
      recurringRules: [],
    })!;

    expect(result.staleValues).toEqual({
      staleCount: 0,
      missingCount: 0,
      oldestAgeDays: null,
    });
  });

  it("returns no close outside the window", () => {
    expect(
      monthClose({
        today: "2026-08-12",
        transactions: [],
        categories,
        containers: [],
        snapshots: [],
        budgetTargets: [],
        recurringRules: [],
      }),
    ).toBeNull();
  });
});
