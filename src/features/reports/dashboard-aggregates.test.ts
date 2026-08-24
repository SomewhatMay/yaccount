import { expect, it, vi } from "vitest";
import {
  createDashboardAggregates,
  type DashboardAggregateCalculators,
  type DashboardAggregateInputs,
} from "./dashboard-aggregates";

const inputs: DashboardAggregateInputs = {
  budgetTargets: [],
  categories: [],
  containers: [],
  ledgerTransactions: [],
  reportTransactions: [],
  recurringRules: [],
  snapshots: [],
  goals: [],
};

function calculators(): DashboardAggregateCalculators {
  return {
    monthlyTotals: vi.fn(() => []),
    periodSummary: vi.fn(() => ({
      income: 0,
      expense: 0,
      saved: 0,
      savingsRate: null,
    })),
    overallBalance: vi.fn(() => 0),
    upcomingOccurrences: vi.fn(() => []),
    moneyMap: vi.fn(() => ({
      knownTrackedValue: 0,
      unvaluedCount: 0,
      branches: [],
    })),
    whatChanged: vi.fn(() => null),
    budgetTriage: vi.fn(() => ({
      yearMonth: "2026-08",
      start: "2026-08-01",
      end: "2026-08-31",
      elapsedDays: 23,
      daysInMonth: 31,
      rows: [],
      counts: { needsAttention: 0, watch: 0, onTrack: 0 },
    })),
    goalOutlook: vi.fn(() => ({
      rows: [],
      totalMonthly: 0,
      counts: { onTrack: 0, needsChange: 0, passive: 0 },
    })),
    cashHorizon: vi.fn(() => ({
      start: "2026-08-23",
      end: "2026-09-22",
      days: 30 as const,
      containerIds: [],
      startingBalance: 0,
      projectedBalance: 0,
      low: { balance: 0, date: "2026-08-23" },
      firstBelowZero: null,
      largestShortfall: 0,
      nextIncome: null,
      billsBeforeNextIncome: { count: 0, amount: 0 },
      events: [],
      unknownEvents: [],
    })),
    allocationPlanMonth: vi.fn(() => ({
      mode: "month" as const,
      yearMonth: "2026-08",
      expectedIncome: 0,
      incomeFromRules: false,
      received: 0,
      stillScheduled: 0,
      allowances: [],
      totalAllowances: 0,
      goalAsks: [],
      totalGoalAsks: 0,
      planned: 0,
      unplanned: 0,
      overPlanned: false,
    })),
    allocationPlanPayCycle: vi.fn(() => null),
    monthLanding: vi.fn(() => ({
      yearMonth: "2026-08",
      start: "2026-08-01",
      today: "2026-08-23",
      end: "2026-08-31",
      daysInMonth: 31,
      elapsedDays: 23,
      actualIncome: 0,
      actualExpense: 0,
      keptSoFar: 0,
      actualPoints: [
        { date: "2026-08-01", kept: 0 },
        { date: "2026-08-23", kept: 0 },
      ],
      scheduledItems: [],
      unknownItems: [],
      remainingScheduledNet: 0,
      usualFlexibleSpending: null,
      expectedRange: null,
      likelyKept: 0,
      history: [],
      estimate: "scheduled-only" as const,
    })),
    incomeResilience: vi.fn(() => ({
      months: [],
      monthly: [],
      eligible: false,
      monthsNeeded: 6,
      typicalMonthly: null,
      observedMin: null,
      observedMax: null,
      monthToMonthRange: null,
      sources: [],
      largestSourceShare: null,
      scheduledFixedMonthly: 0,
    })),
    containerWatch: vi.fn(() => ({
      containerId: "general",
      currentBalance: 0,
      netFlow30Days: 0,
      forecast: {
        start: "2026-08-23",
        end: "2026-09-22",
        days: 30 as const,
        containerIds: ["general"],
        startingBalance: 0,
        projectedBalance: 0,
        low: { balance: 0, date: "2026-08-23" },
        firstBelowZero: null,
        largestShortfall: 0,
        nextIncome: null,
        billsBeforeNextIncome: { count: 0, amount: 0 },
        events: [],
        unknownEvents: [],
      },
      floor: null,
      distanceAboveFloor: null,
      floorBreached: null,
    })),
    categoryWatch: vi.fn(() => ({
      categoryId: "groceries",
      yearMonth: "2026-08",
      spent: 0,
      budget: null,
      remaining: null,
      recent7DaySpend: 0,
      likelyMonthEnd: 0,
      sixMonthMedian: 0,
      months: [],
    })),
    moneyBrief: vi.fn(() => ({
      items: [],
      totalItems: 0,
      hiddenItemCount: 0,
      nextKnownBill: null,
      hasScheduledContext: false,
    })),
    commitments: vi.fn(() => ({
      start: "2026-08-23",
      end: "2027-08-22",
      activeExpenseRuleCount: 0,
      regular: {
        rules: [],
        occurrences: [],
        knownNext12Months: 0,
        monthlyEquivalent: 0,
        unknownAmountCount: 0,
        nextOccurrence: null,
        groups: [],
      },
      irregular: {
        rules: [],
        occurrences: [],
        knownNext12Months: 0,
        monthlyEquivalent: 0,
        unknownAmountCount: 0,
        nextOccurrence: null,
        months: [],
      },
    })),
  };
}

it("shares exact dashboard aggregates within one data revision", () => {
  const calculate = calculators();
  const aggregates = createDashboardAggregates(inputs, calculate);
  const range = { start: "2026-08-01", end: "2026-08-31" };

  expect(aggregates.monthly(range)).toBe(aggregates.monthly({ ...range }));
  expect(aggregates.period(range)).toBe(aggregates.period({ ...range }));
  expect(aggregates.occurrences("2026-08-01", "2026-08-31")).toBe(
    aggregates.occurrences("2026-08-01", "2026-08-31"),
  );
  expect(aggregates.balance()).toBe(aggregates.balance());
  expect(aggregates.moneyMap()).toBe(aggregates.moneyMap());
  expect(aggregates.whatChanged(range)).toBe(aggregates.whatChanged({ ...range }));
  expect(aggregates.budgetTriage("2026-08-23")).toBe(
    aggregates.budgetTriage("2026-08-23"),
  );
  expect(aggregates.goalOutlook("2026-08-23")).toBe(aggregates.goalOutlook("2026-08-23"));
  expect(aggregates.cashHorizon("2026-08-23", 30)).toBe(
    aggregates.cashHorizon("2026-08-23", 30),
  );
  expect(aggregates.allocationMonth("2026-08-23", 123)).toBe(
    aggregates.allocationMonth("2026-08-23", 123),
  );
  expect(aggregates.allocationPayCycle("2026-08-23", ["salary"])).toBe(
    aggregates.allocationPayCycle("2026-08-23", ["salary"]),
  );
  expect(aggregates.monthLanding("2026-08-23")).toBe(
    aggregates.monthLanding("2026-08-23"),
  );
  expect(aggregates.incomeResilience(range, "2026-08-23")).toBe(
    aggregates.incomeResilience({ ...range }, "2026-08-23"),
  );
  expect(aggregates.containerWatch("general", "2026-08-23", 25_000)).toBe(
    aggregates.containerWatch("general", "2026-08-23", 25_000),
  );
  expect(aggregates.categoryWatch("groceries", "2026-08-23")).toBe(
    aggregates.categoryWatch("groceries", "2026-08-23"),
  );
  expect(aggregates.moneyBrief("2026-08-23")).toBe(aggregates.moneyBrief("2026-08-23"));
  expect(aggregates.commitments("2026-08-23")).toBe(aggregates.commitments("2026-08-23"));

  expect(calculate.monthlyTotals).toHaveBeenCalledOnce();
  expect(calculate.periodSummary).toHaveBeenCalledOnce();
  expect(calculate.upcomingOccurrences).toHaveBeenCalledOnce();
  expect(calculate.overallBalance).toHaveBeenCalledOnce();
  expect(calculate.moneyMap).toHaveBeenCalledOnce();
  expect(calculate.whatChanged).toHaveBeenCalledOnce();
  expect(calculate.budgetTriage).toHaveBeenCalledOnce();
  expect(calculate.goalOutlook).toHaveBeenCalledOnce();
  expect(calculate.cashHorizon).toHaveBeenCalledOnce();
  expect(calculate.allocationPlanMonth).toHaveBeenCalledOnce();
  expect(calculate.allocationPlanPayCycle).toHaveBeenCalledOnce();
  expect(calculate.monthLanding).toHaveBeenCalledOnce();
  expect(calculate.incomeResilience).toHaveBeenCalledOnce();
  expect(calculate.containerWatch).toHaveBeenCalledOnce();
  expect(calculate.categoryWatch).toHaveBeenCalledOnce();
  expect(calculate.moneyBrief).toHaveBeenCalledOnce();
  expect(calculate.commitments).toHaveBeenCalledOnce();
  expect(calculate.containerWatch).toHaveBeenCalledWith({
    today: "2026-08-23",
    containerId: "general",
    floor: 25_000,
    transactions: inputs.ledgerTransactions,
    categories: inputs.categories,
    containers: inputs.containers,
    recurringRules: inputs.recurringRules,
  });
  expect(calculate.categoryWatch).toHaveBeenCalledWith({
    today: "2026-08-23",
    categoryId: "groceries",
    transactions: inputs.reportTransactions,
    budgetTargets: inputs.budgetTargets,
  });
  expect(calculate.moneyBrief).toHaveBeenCalledWith({
    today: "2026-08-23",
    ledgerTransactions: inputs.ledgerTransactions,
    containers: inputs.containers,
    snapshots: inputs.snapshots,
    recurringRules: inputs.recurringRules,
    budgetTriage: expect.objectContaining({ yearMonth: "2026-08" }),
    cashHorizon: expect.objectContaining({ days: 30 }),
  });
  expect(calculate.commitments).toHaveBeenCalledWith({
    today: "2026-08-23",
    categories: inputs.categories,
    recurringRules: inputs.recurringRules,
  });
});

it("does not share cached money across data revisions or ranges", () => {
  const calculate = calculators();
  const first = createDashboardAggregates(inputs, calculate);
  const second = createDashboardAggregates({ ...inputs }, calculate);

  first.monthly({ start: "2026-07-01", end: "2026-07-31" });
  first.monthly({ start: "2026-08-01", end: "2026-08-31" });
  second.monthly({ start: "2026-08-01", end: "2026-08-31" });

  expect(calculate.monthlyTotals).toHaveBeenCalledTimes(3);
});
