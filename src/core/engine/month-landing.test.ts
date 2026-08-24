import { describe, expect, it } from "vitest";
import {
  makeCategory,
  makeRecurringRule,
  makeTransaction,
  makeTransfer,
  type RecurringRule,
} from "@/core/model";
import { monthLanding } from "./month-landing";

const income = makeCategory({ id: "income", name: "Income", type: "income" });
const expense = makeCategory({ id: "expense", name: "Expense", type: "expense" });
const hidden = {
  ...makeCategory({ id: "hidden", name: "Hidden", type: "expense" }),
  excluded_from_stats: true,
};
const categories = [income, expense, hidden];

function rule(
  id: string,
  day: number,
  amount: number | null,
  categoryId: string,
): RecurringRule {
  return makeRecurringRule({
    id,
    frequency: "monthly",
    interval_config: { day_of_month: day },
    template_vendor_source: id,
    template_container_id: "general",
    template_category_id: categoryId,
    template_amount: amount,
    amount_mode: amount === null ? "goal_derived" : "fixed",
    start_date: "2026-01-01",
  });
}

describe("monthLanding", () => {
  it("reconciles actual kept and de-duplicated remaining scheduled net", () => {
    const salary = rule("Salary", 30, 100_000, income.id);
    const bill = rule("Bill", 27, -10_000, expense.id);
    const gym = rule("Gym", 28, -5_000, expense.id);
    const hiddenRule = rule("Hidden rule", 29, -50_000, hidden.id);
    const transfer = makeRecurringRule({
      id: "Transfer",
      frequency: "monthly",
      interval_config: { day_of_month: 29 },
      template_vendor_source: "Transfer",
      template_container_id: "general",
      template_to_container_id: "savings",
      template_amount: 25_000,
      start_date: "2026-01-01",
    });
    const result = monthLanding({
      today: "2026-08-23",
      transactions: [
        makeTransaction({
          id: "income-actual",
          date: "2026-08-10",
          amount: 300_000,
          vendor_source: "Income actual",
          category_id: income.id,
        }),
        makeTransaction({
          id: "expense-actual",
          date: "2026-08-15",
          amount: -50_000,
          vendor_source: "Expense actual",
          category_id: expense.id,
        }),
        makeTransaction({
          id: "refund-actual",
          date: "2026-08-16",
          amount: 5_000,
          vendor_source: "Refund actual",
          category_id: expense.id,
        }),
        makeTransfer({
          id: "transfer-actual",
          date: "2026-08-17",
          amount: 10_000,
          container_id: "general",
          to_container_id: "savings",
          vendor_source: "Transfer actual",
        }),
        makeTransaction({
          id: "hidden-actual",
          date: "2026-08-18",
          amount: -99_900,
          vendor_source: "Hidden actual",
          category_id: hidden.id,
        }),
        {
          ...makeTransaction({
            id: "salary-approved",
            date: "2026-08-29",
            amount: 100_000,
            vendor_source: "Salary approved",
            category_id: income.id,
            recurring_rule_id: salary.id,
          }),
          recurring_occurrence_date: "2026-08-30",
        },
        makeTransaction({
          id: "salary-pending",
          date: "2026-08-30",
          amount: 100_000,
          vendor_source: "Salary pending",
          category_id: income.id,
          recurring_rule_id: salary.id,
          inbox_status: "pending",
        }),
        makeTransaction({
          id: "future-expense",
          date: "2026-08-25",
          amount: -20_000,
          vendor_source: "Future expense",
          category_id: expense.id,
        }),
        makeTransaction({
          id: "bill-pending",
          date: "2026-08-27",
          amount: -10_000,
          vendor_source: "Bill pending",
          category_id: expense.id,
          recurring_rule_id: bill.id,
          inbox_status: "pending",
        }),
      ],
      categories,
      recurringRules: [salary, bill, gym, hiddenRule, transfer],
    });

    expect(result).toMatchObject({
      yearMonth: "2026-08",
      start: "2026-08-01",
      end: "2026-08-31",
      actualIncome: 300_000,
      actualExpense: 45_000,
      keptSoFar: 255_000,
      remainingScheduledNet: 65_000,
      usualFlexibleSpending: null,
      expectedRange: null,
      likelyKept: 320_000,
      estimate: "scheduled-only",
    });
    expect(result.scheduledItems).toEqual([
      expect.objectContaining({
        id: "future-expense",
        date: "2026-08-25",
        amount: -20_000,
        source: "approved-future",
      }),
      expect.objectContaining({
        id: "bill-pending",
        date: "2026-08-27",
        amount: -10_000,
        source: "pending",
      }),
      expect.objectContaining({
        id: "Gym:2026-08-28",
        date: "2026-08-28",
        amount: -5_000,
        source: "recurring",
      }),
      expect.objectContaining({
        id: "salary-approved",
        date: "2026-08-29",
        amount: 100_000,
        source: "approved-future",
      }),
    ]);
    expect(result.actualPoints).toEqual([
      { date: "2026-08-01", kept: 0 },
      { date: "2026-08-10", kept: 300_000 },
      { date: "2026-08-15", kept: 250_000 },
      { date: "2026-08-16", kept: 255_000 },
      { date: "2026-08-23", kept: 255_000 },
    ]);
  });

  it("uses the last three complete aligned slices for the median and range", () => {
    const salary = rule("Salary", 30, 20_000, income.id);
    const bill = rule("Bill", 25, -5_000, expense.id);
    const result = monthLanding({
      today: "2026-08-23",
      transactions: [
        makeTransaction({
          id: "coverage",
          date: "2026-05-01",
          amount: 100,
          vendor_source: "Coverage",
          category_id: income.id,
        }),
        makeTransaction({
          id: "may-spend",
          date: "2026-05-24",
          amount: -9_000,
          vendor_source: "May spend",
          category_id: expense.id,
        }),
        makeTransaction({
          id: "may-refund",
          date: "2026-05-25",
          amount: 1_000,
          vendor_source: "May refund",
          category_id: expense.id,
        }),
        makeTransaction({
          id: "may-recurring",
          date: "2026-05-26",
          amount: -99_900,
          vendor_source: "May recurring",
          category_id: expense.id,
          recurring_rule_id: bill.id,
        }),
        makeTransaction({
          id: "june-spend",
          date: "2026-06-23",
          amount: -6_000,
          vendor_source: "June spend",
          category_id: expense.id,
        }),
        makeTransaction({
          id: "current-income",
          date: "2026-08-10",
          amount: 100_000,
          vendor_source: "Current income",
          category_id: income.id,
        }),
        makeTransaction({
          id: "current-spend",
          date: "2026-08-15",
          amount: -20_000,
          vendor_source: "Current spend",
          category_id: expense.id,
        }),
      ],
      categories,
      recurringRules: [salary, bill],
    });

    expect(result.history).toEqual([
      {
        month: "2026-05",
        start: "2026-05-24",
        end: "2026-05-31",
        flexibleSpending: 8_000,
      },
      {
        month: "2026-06",
        start: "2026-06-23",
        end: "2026-06-30",
        flexibleSpending: 6_000,
      },
      {
        month: "2026-07",
        start: "2026-07-24",
        end: "2026-07-31",
        flexibleSpending: 0,
      },
    ]);
    expect(result).toMatchObject({
      estimate: "full",
      keptSoFar: 80_000,
      remainingScheduledNet: 15_000,
      usualFlexibleSpending: 6_000,
      expectedRange: { low: 87_000, high: 95_000 },
      likelyKept: 89_000,
    });
  });

  it.each([
    ["no complete months", [], 0, "scheduled-only", null],
    [
      "one complete month",
      [
        makeTransaction({
          id: "july-coverage",
          date: "2026-07-01",
          amount: 100,
          vendor_source: "July coverage",
          category_id: income.id,
        }),
        makeTransaction({
          id: "july-flex",
          date: "2026-07-24",
          amount: -10_000,
          vendor_source: "July flex",
          category_id: expense.id,
        }),
      ],
      1,
      "scheduled-only",
      null,
    ],
    [
      "two complete months",
      [
        makeTransaction({
          id: "june-coverage",
          date: "2026-06-01",
          amount: 100,
          vendor_source: "June coverage",
          category_id: income.id,
        }),
        makeTransaction({
          id: "june-flex",
          date: "2026-06-23",
          amount: -10_001,
          vendor_source: "June flex",
          category_id: expense.id,
        }),
        makeTransaction({
          id: "july-flex-2",
          date: "2026-07-24",
          amount: -10_000,
          vendor_source: "July flex",
          category_id: expense.id,
        }),
      ],
      2,
      "early",
      10_001,
    ],
  ] as const)("%s", (_label, transactions, historyCount, estimate, median) => {
    const result = monthLanding({
      today: "2026-08-23",
      transactions: [...transactions],
      categories,
      recurringRules: [rule("Salary", 30, 20_000, income.id)],
    });

    expect(result.history).toHaveLength(historyCount);
    expect(result.estimate).toBe(estimate);
    expect(result.usualFlexibleSpending).toBe(median);
  });

  it("aligns leap-February and 31-day month slices by elapsed fraction", () => {
    const result = monthLanding({
      today: "2028-03-15",
      transactions: [
        makeTransaction({
          id: "coverage",
          date: "2027-12-01",
          amount: 100,
          vendor_source: "Coverage",
          category_id: income.id,
        }),
      ],
      categories,
      recurringRules: [],
    });

    expect(
      result.history.map(({ month, start, end }) => ({ month, start, end })),
    ).toEqual([
      { month: "2027-12", start: "2027-12-16", end: "2027-12-31" },
      { month: "2028-01", start: "2028-01-16", end: "2028-01-31" },
      { month: "2028-02", start: "2028-02-15", end: "2028-02-29" },
    ]);
  });

  it("uses an empty valid slice after each prior month when today is month end", () => {
    const result = monthLanding({
      today: "2028-03-31",
      transactions: [
        makeTransaction({
          id: "coverage",
          date: "2027-12-01",
          amount: 100,
          vendor_source: "Coverage",
          category_id: income.id,
        }),
      ],
      categories,
      recurringRules: [],
    });

    expect(result.history).toEqual([
      {
        month: "2027-12",
        start: "2028-01-01",
        end: "2027-12-31",
        flexibleSpending: 0,
      },
      {
        month: "2028-01",
        start: "2028-02-01",
        end: "2028-01-31",
        flexibleSpending: 0,
      },
      {
        month: "2028-02",
        start: "2028-03-01",
        end: "2028-02-29",
        flexibleSpending: 0,
      },
    ]);
  });

  it("keeps an overdue pending occurrence expected and labels an unknown amount", () => {
    const overdue = rule("Overdue bill", 20, -10_000, expense.id);
    const unknown = rule("Set later", 26, null, expense.id);
    const result = monthLanding({
      today: "2026-08-23",
      transactions: [
        makeTransaction({
          id: "overdue-pending",
          date: "2026-08-20",
          amount: -10_000,
          vendor_source: "Overdue bill",
          category_id: expense.id,
          recurring_rule_id: overdue.id,
          inbox_status: "pending",
        }),
      ],
      categories,
      recurringRules: [overdue, unknown],
    });

    expect(result.actualExpense).toBe(0);
    expect(result.remainingScheduledNet).toBe(-10_000);
    expect(result.scheduledItems).toEqual([
      expect.objectContaining({
        id: "overdue-pending",
        date: "2026-08-20",
        source: "pending",
      }),
    ]);
    expect(result.unknownItems).toEqual([
      { ruleId: unknown.id, date: "2026-08-26", label: "Set later" },
    ]);
  });
});
