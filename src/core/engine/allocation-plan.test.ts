import { describe, expect, it } from "vitest";
import {
  makeBudgetTarget,
  makeCategory,
  makeGoal,
  makeRecurringRule,
  makeTransaction,
  type BudgetTarget,
  type RecurringRule,
} from "@/core/model";
import { allocationPlanMonth, allocationPlanPayCycle } from "./allocation-plan";

const salaryCategory = makeCategory({
  id: "salary",
  name: "Salary",
  type: "income",
});
const sideCategory = makeCategory({
  id: "side",
  name: "Side income",
  type: "income",
});
const groceries = makeCategory({
  id: "groceries",
  name: "Groceries",
  type: "expense",
});
const categories = [salaryCategory, sideCategory, groceries];

function monthlyRule(
  id: string,
  day: number,
  amount: number,
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
    start_date: "2026-01-01",
  });
}

function fixedGoal(amount: number) {
  return makeGoal({
    id: "goal",
    container_id: "goal-container",
    name: "Emergency reserve",
    kind: "spend_down",
    mode: "fixed",
    planned_monthly: amount,
    created_date: "2026-01-01",
  });
}

describe("allocationPlanMonth", () => {
  it("reuses the monthly plan and splits expected income into received and scheduled", () => {
    const salary = monthlyRule("Salary", 30, 580_000, salaryCategory.id);
    const result = allocationPlanMonth({
      today: "2026-08-23",
      txns: [
        makeTransaction({
          id: "received",
          date: "2026-08-15",
          amount: 435_000,
          vendor_source: "Salary received",
          category_id: salaryCategory.id,
        }),
      ],
      categories,
      goals: [fixedGoal(59_000)],
      budgetTargets: [
        makeBudgetTarget({
          category_id: groceries.id,
          amount: 426_000,
          start_date: "2026-01-01",
        }),
      ],
      rules: [salary],
      manualIncome: 0,
    });

    expect(result).toMatchObject({
      mode: "month",
      yearMonth: "2026-08",
      expectedIncome: 580_000,
      incomeFromRules: true,
      received: 435_000,
      stillScheduled: 145_000,
      totalAllowances: 426_000,
      totalGoalAsks: 59_000,
      planned: 485_000,
      unplanned: 95_000,
      overPlanned: false,
    });
  });

  it("uses synced manual income when no recurring income covers the month", () => {
    const result = allocationPlanMonth({
      today: "2026-08-23",
      txns: [],
      categories,
      goals: [],
      budgetTargets: [],
      rules: [],
      manualIncome: 250_000,
    });

    expect(result).toMatchObject({
      expectedIncome: 250_000,
      incomeFromRules: false,
      received: 0,
      stillScheduled: 250_000,
      unplanned: 250_000,
    });
  });
});

describe("allocationPlanPayCycle", () => {
  it("uses selected income anchors while counting other income inside the cycle", () => {
    const salary = makeRecurringRule({
      id: "Salary",
      frequency: "biweekly",
      interval_config: { days_of_month: [16, 30] },
      template_vendor_source: "Salary",
      template_container_id: "general",
      template_category_id: salaryCategory.id,
      template_amount: 290_000,
      start_date: "2026-01-01",
    });
    const side = monthlyRule("Side work", 25, 10_000, sideCategory.id);
    const power = monthlyRule("Power", 24, -2_000, groceries.id);
    const budget = makeBudgetTarget({
      category_id: groceries.id,
      amount: 31_000,
      start_date: "2026-01-01",
    });
    const input = {
      today: "2026-08-23",
      txns: [],
      categories,
      goals: [fixedGoal(31_000)],
      budgetTargets: [budget],
      rules: [salary, side, power],
      anchorRuleIds: [salary.id],
    };
    const result = allocationPlanPayCycle(input)!;

    expect(result).toMatchObject({
      mode: "pay-cycle",
      start: "2026-08-16",
      end: "2026-08-29",
      nextIncome: {
        date: "2026-08-30",
        daysAway: 7,
        amount: 290_000,
        label: "Salary",
      },
      income: 300_000,
      totalScheduledExpenses: 2_000,
      flexibleBudgetShare: 5_000,
      goalAskShare: 7_000,
      planned: 14_000,
      unplanned: 286_000,
      overPlanned: false,
    });
    expect(result.scheduledExpenses).toEqual([
      expect.objectContaining({ date: "2026-08-24", label: "Power", amount: 2_000 }),
    ]);

    expect(
      allocationPlanPayCycle({ ...input, anchorRuleIds: undefined })?.nextIncome,
    ).toMatchObject({ date: "2026-08-25", label: "Side work" });
  });

  it("pro-rates each month segment and excludes the next-income day exactly", () => {
    const salary = monthlyRule("Salary", 5, 100_000, salaryCategory.id);
    const finalBill = monthlyRule("Final bill", 4, -1_000, groceries.id);
    const boundaryBill = monthlyRule("Boundary bill", 5, -99_000, groceries.id);
    const transfer = makeRecurringRule({
      id: "Transfer",
      frequency: "monthly",
      interval_config: { day_of_month: 4 },
      template_vendor_source: "Transfer",
      template_container_id: "general",
      template_to_container_id: "savings",
      template_amount: 50_000,
      start_date: "2026-01-01",
    });
    const budgets: BudgetTarget[] = [
      makeBudgetTarget({
        category_id: groceries.id,
        amount: 31_000,
        start_date: "2026-01-01",
      }),
      makeBudgetTarget({
        category_id: groceries.id,
        amount: 28_000,
        start_date: "2026-02-01",
      }),
    ];
    const result = allocationPlanPayCycle({
      today: "2026-01-28",
      txns: [],
      categories,
      goals: [fixedGoal(31_000)],
      budgetTargets: budgets,
      rules: [salary, finalBill, boundaryBill, transfer],
      anchorRuleIds: [salary.id],
    })!;

    expect(result).toMatchObject({
      start: "2026-01-05",
      end: "2026-02-04",
      allowanceShare: 8_000,
      totalScheduledExpenses: 1_000,
      flexibleBudgetShare: 7_000,
      goalAskShare: 8_429,
      planned: 16_429,
      unplanned: 83_571,
    });
    expect(result.scheduledExpenses.map((item) => item.label)).toEqual(["Final bill"]);
  });

  it("does not treat a positive expense-category occurrence as a bill", () => {
    const salary = monthlyRule("Salary", 30, 100_000, salaryCategory.id);
    const refund = monthlyRule("Refund", 24, 5_000, groceries.id);

    const result = allocationPlanPayCycle({
      today: "2026-08-23",
      txns: [],
      categories,
      goals: [],
      budgetTargets: [],
      rules: [salary, refund],
      anchorRuleIds: [salary.id],
    })!;

    expect(result.scheduledExpenses).toEqual([]);
    expect(result.totalScheduledExpenses).toBe(0);
  });

  it("returns unavailable when no selected positive income has a next occurrence", () => {
    const ended = makeRecurringRule({
      ...monthlyRule("Ended", 15, 100_000, salaryCategory.id),
      end_date: "2026-08-20",
    });

    expect(
      allocationPlanPayCycle({
        today: "2026-08-23",
        txns: [],
        categories,
        goals: [],
        budgetTargets: [],
        rules: [ended],
        anchorRuleIds: [ended.id],
      }),
    ).toBeNull();
  });
});
