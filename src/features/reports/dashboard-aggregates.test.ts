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

  expect(calculate.monthlyTotals).toHaveBeenCalledOnce();
  expect(calculate.periodSummary).toHaveBeenCalledOnce();
  expect(calculate.upcomingOccurrences).toHaveBeenCalledOnce();
  expect(calculate.overallBalance).toHaveBeenCalledOnce();
  expect(calculate.moneyMap).toHaveBeenCalledOnce();
  expect(calculate.whatChanged).toHaveBeenCalledOnce();
  expect(calculate.budgetTriage).toHaveBeenCalledOnce();
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
