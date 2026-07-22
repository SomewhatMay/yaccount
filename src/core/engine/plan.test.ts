import { describe, it, expect } from "vitest";
import {
  makeBudgetTarget,
  makeCategory,
  makeGoal,
  makeRecurringRule,
  type Category,
} from "@/core/model";
import { occurrencesInMonth, expectedIncomeFromRules, monthlyPlan } from "@/core/engine";

const categories: Category[] = [
  makeCategory({ id: "salary", name: "Salary", type: "income" }),
  makeCategory({ id: "groceries", name: "Groceries", type: "expense" }),
  makeCategory({ id: "gas", name: "Gas", type: "expense" }),
];

function incomeRule(amount: number, day: number) {
  return makeRecurringRule({
    id: "inc",
    frequency: "monthly",
    interval_config: { day_of_month: day },
    template_vendor_source: "Employer",
    template_container_id: "general",
    template_category_id: "salary",
    template_amount: amount,
    start_date: "2026-01-01",
  });
}

describe("occurrencesInMonth (§6.8 income enumeration)", () => {
  it("counts a monthly rule once", () => {
    expect(occurrencesInMonth(incomeRule(300000, 1), "2026-07")).toBe(1);
  });
  it("counts a biweekly (twice-monthly) rule twice", () => {
    const r = makeRecurringRule({
      id: "b",
      frequency: "biweekly",
      interval_config: { days_of_month: [1, 15] },
      template_vendor_source: "Pay",
      template_container_id: "general",
      template_category_id: "salary",
      template_amount: 150000,
      start_date: "2026-01-01",
    });
    expect(occurrencesInMonth(r, "2026-07")).toBe(2);
  });
  it("counts nothing for a month before the rule starts or after it ends", () => {
    expect(occurrencesInMonth(incomeRule(300000, 1), "2025-12")).toBe(0);
    const ended = makeRecurringRule({
      id: "e",
      frequency: "monthly",
      interval_config: { day_of_month: 1 },
      template_vendor_source: "Pay",
      template_container_id: "general",
      template_category_id: "salary",
      template_amount: 300000,
      start_date: "2026-01-01",
      end_date: "2026-06-30",
    });
    expect(occurrencesInMonth(ended, "2026-07")).toBe(0);
  });
  it("counts nothing for a cancelled rule", () => {
    const r = makeRecurringRule({
      id: "c",
      frequency: "monthly",
      interval_config: { day_of_month: 1 },
      template_vendor_source: "Pay",
      template_container_id: "general",
      template_category_id: "salary",
      template_amount: 300000,
      start_date: "2026-01-01",
      status: "cancelled",
    });
    expect(occurrencesInMonth(r, "2026-07")).toBe(0);
  });
});

describe("expectedIncomeFromRules (§6.8)", () => {
  it("sums income-rule occurrences for the month; ignores expense/transfer rules", () => {
    const expenseRule = makeRecurringRule({
      id: "exp",
      frequency: "monthly",
      interval_config: { day_of_month: 5 },
      template_vendor_source: "Netflix",
      template_container_id: "general",
      template_category_id: "groceries",
      template_amount: -1500,
      start_date: "2026-01-01",
    });
    const res = expectedIncomeFromRules(
      [incomeRule(300000, 1), expenseRule],
      categories,
      "2026-07",
    );
    expect(res.total).toBe(300000);
    expect(res.covered).toBe(true);
  });
  it("reports not-covered when no income rule reaches the month", () => {
    const res = expectedIncomeFromRules([], categories, "2026-07");
    expect(res.total).toBe(0);
    expect(res.covered).toBe(false);
  });
});

describe("monthlyPlan — every dollar a purpose (§6.8)", () => {
  const budgetTargets = [
    makeBudgetTarget({
      category_id: "groceries",
      amount: 50000,
      start_date: "2026-01-01",
    }),
    makeBudgetTarget({ category_id: "gas", amount: 20000, start_date: "2026-01-01" }),
  ];
  const goal = makeGoal({
    container_id: "house",
    kind: "spend_down",
    mode: "fixed",
    planned_monthly: 100000,
    created_date: "2026-01-01",
  });

  it("income − allowances − goal asks = unallocated (positive)", () => {
    const plan = monthlyPlan({
      yearMonth: "2026-07",
      today: "2026-07-01",
      txns: [],
      categories,
      goals: [goal],
      budgetTargets,
      rules: [incomeRule(300000, 1)],
      manualIncome: 0,
    });
    expect(plan.income).toBe(300000);
    expect(plan.incomeFromRules).toBe(true);
    expect(plan.totalAllowances).toBe(70000); // groceries 500 + gas 200
    expect(plan.totalAsks).toBe(100000); // the fixed goal
    expect(plan.unallocated).toBe(130000);
    expect(plan.overAllocated).toBe(false);
  });

  it("uses the manual figure when no income rules cover the month", () => {
    const plan = monthlyPlan({
      yearMonth: "2026-07",
      today: "2026-07-01",
      txns: [],
      categories,
      goals: [],
      budgetTargets,
      rules: [],
      manualIncome: 250000,
    });
    expect(plan.income).toBe(250000);
    expect(plan.incomeFromRules).toBe(false);
    expect(plan.unallocated).toBe(180000);
  });

  it("over-allocation goes negative and flags overAllocated (flagged, never blocked)", () => {
    const bigGoal = makeGoal({
      container_id: "house",
      kind: "spend_down",
      mode: "fixed",
      planned_monthly: 500000,
      created_date: "2026-01-01",
    });
    const plan = monthlyPlan({
      yearMonth: "2026-07",
      today: "2026-07-01",
      txns: [],
      categories,
      goals: [bigGoal],
      budgetTargets,
      rules: [incomeRule(300000, 1)],
      manualIncome: 0,
    });
    expect(plan.unallocated).toBeLessThan(0);
    expect(plan.overAllocated).toBe(true);
  });

  it("excludes archived/cancelled/completed goals and archived categories from the plan", () => {
    const archivedGoal = makeGoal({
      container_id: "old",
      kind: "spend_down",
      mode: "fixed",
      planned_monthly: 100000,
      is_archived: true,
      created_date: "2026-01-01",
    });
    const cancelledGoal = makeGoal({
      container_id: "gone",
      kind: "spend_down",
      mode: "fixed",
      planned_monthly: 100000,
      status: "cancelled",
      created_date: "2026-01-01",
    });
    const plan = monthlyPlan({
      yearMonth: "2026-07",
      today: "2026-07-01",
      txns: [],
      categories,
      goals: [archivedGoal, cancelledGoal],
      budgetTargets,
      rules: [incomeRule(300000, 1)],
      manualIncome: 0,
    });
    expect(plan.totalAsks).toBe(0);
    expect(plan.asks).toHaveLength(0);
  });
});
