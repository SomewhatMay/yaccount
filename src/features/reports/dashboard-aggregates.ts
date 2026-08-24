import {
  allocationPlanMonth as deriveAllocationMonth,
  allocationPlanPayCycle as deriveAllocationPayCycle,
  budgetTriage as deriveBudgetTriage,
  cashHorizon as deriveCashHorizon,
  goalOutlook as deriveGoalOutlook,
  monthlyTotals,
  moneyMap as deriveMoneyMap,
  overallBalance,
  periodSummary,
  upcomingOccurrences,
  whatChanged as deriveWhatChanged,
  type DateRange,
  type CashHorizonDays,
} from "@/core/engine";
import type {
  BudgetTarget,
  Category,
  Container,
  ContainerSnapshot,
  Goal,
  RecurringRule,
  Transaction,
} from "@/core/model";

export interface DashboardAggregateInputs {
  budgetTargets: BudgetTarget[];
  categories: Category[];
  containers: Container[];
  ledgerTransactions: Transaction[];
  reportTransactions: Transaction[];
  recurringRules: RecurringRule[];
  snapshots: ContainerSnapshot[];
  goals: Goal[];
}

export interface DashboardAggregateCalculators {
  monthlyTotals: typeof monthlyTotals;
  periodSummary: typeof periodSummary;
  overallBalance: typeof overallBalance;
  upcomingOccurrences: typeof upcomingOccurrences;
  moneyMap: typeof deriveMoneyMap;
  whatChanged: typeof deriveWhatChanged;
  budgetTriage: typeof deriveBudgetTriage;
  goalOutlook: typeof deriveGoalOutlook;
  cashHorizon: typeof deriveCashHorizon;
  allocationPlanMonth: typeof deriveAllocationMonth;
  allocationPlanPayCycle: typeof deriveAllocationPayCycle;
}

export interface DashboardAggregates {
  monthly: (range: DateRange) => ReturnType<typeof monthlyTotals>;
  period: (range: DateRange) => ReturnType<typeof periodSummary>;
  balance: () => number;
  occurrences: (from: string, to: string) => ReturnType<typeof upcomingOccurrences>;
  moneyMap: () => ReturnType<typeof deriveMoneyMap>;
  whatChanged: (range: DateRange) => ReturnType<typeof deriveWhatChanged>;
  budgetTriage: (today: string) => ReturnType<typeof deriveBudgetTriage>;
  goalOutlook: (today: string) => ReturnType<typeof deriveGoalOutlook>;
  cashHorizon: (
    today: string,
    days: CashHorizonDays,
  ) => ReturnType<typeof deriveCashHorizon>;
  allocationMonth: (
    today: string,
    manualIncome: number,
  ) => ReturnType<typeof deriveAllocationMonth>;
  allocationPayCycle: (
    today: string,
    anchorRuleIds?: string[],
  ) => ReturnType<typeof deriveAllocationPayCycle>;
}

const defaultCalculators: DashboardAggregateCalculators = {
  monthlyTotals,
  periodSummary,
  overallBalance,
  upcomingOccurrences,
  moneyMap: deriveMoneyMap,
  whatChanged: deriveWhatChanged,
  budgetTriage: deriveBudgetTriage,
  goalOutlook: deriveGoalOutlook,
  cashHorizon: deriveCashHorizon,
  allocationPlanMonth: deriveAllocationMonth,
  allocationPlanPayCycle: deriveAllocationPayCycle,
};

function rangeKey(range: DateRange): string {
  return `${range.start ?? ""}:${range.end ?? ""}`;
}

/**
 * One render-scoped cache. DashboardView replaces it whenever any input array
 * changes, so no money survives a data revision and every cache key stays exact.
 */
export function createDashboardAggregates(
  inputs: DashboardAggregateInputs,
  calculate: DashboardAggregateCalculators = defaultCalculators,
): DashboardAggregates {
  const monthlyCache = new Map<string, ReturnType<typeof monthlyTotals>>();
  const periodCache = new Map<string, ReturnType<typeof periodSummary>>();
  const occurrenceCache = new Map<string, ReturnType<typeof upcomingOccurrences>>();
  let hasBalance = false;
  let balance = 0;
  let cachedMoneyMap: ReturnType<typeof deriveMoneyMap> | null = null;
  const whatChangedCache = new Map<string, ReturnType<typeof deriveWhatChanged>>();
  const budgetTriageCache = new Map<string, ReturnType<typeof deriveBudgetTriage>>();
  const goalOutlookCache = new Map<string, ReturnType<typeof deriveGoalOutlook>>();
  const cashHorizonCache = new Map<string, ReturnType<typeof deriveCashHorizon>>();
  const allocationMonthCache = new Map<
    string,
    ReturnType<typeof deriveAllocationMonth>
  >();
  const allocationPayCycleCache = new Map<
    string,
    ReturnType<typeof deriveAllocationPayCycle>
  >();

  return {
    monthly(range) {
      const key = rangeKey(range);
      const cached = monthlyCache.get(key);
      if (cached) return cached;
      const result = calculate.monthlyTotals(
        inputs.reportTransactions,
        inputs.categories,
        range,
      );
      monthlyCache.set(key, result);
      return result;
    },
    period(range) {
      const key = rangeKey(range);
      const cached = periodCache.get(key);
      if (cached) return cached;
      const result = calculate.periodSummary(
        inputs.reportTransactions,
        inputs.categories,
        range,
      );
      periodCache.set(key, result);
      return result;
    },
    balance() {
      if (!hasBalance) {
        balance = calculate.overallBalance(inputs.ledgerTransactions, inputs.containers);
        hasBalance = true;
      }
      return balance;
    },
    occurrences(from, to) {
      const key = `${from}:${to}`;
      const cached = occurrenceCache.get(key);
      if (cached) return cached;
      const result = calculate.upcomingOccurrences(inputs.recurringRules, from, to, {
        limit: Number.MAX_SAFE_INTEGER,
      });
      occurrenceCache.set(key, result);
      return result;
    },
    moneyMap() {
      if (!cachedMoneyMap) {
        cachedMoneyMap = calculate.moneyMap(
          inputs.containers,
          inputs.snapshots,
          inputs.ledgerTransactions,
          inputs.goals,
        );
      }
      return cachedMoneyMap;
    },
    whatChanged(range) {
      const key = rangeKey(range);
      if (whatChangedCache.has(key)) return whatChangedCache.get(key)!;
      const result = calculate.whatChanged(
        inputs.reportTransactions,
        inputs.categories,
        range,
      );
      whatChangedCache.set(key, result);
      return result;
    },
    budgetTriage(today) {
      const cached = budgetTriageCache.get(today);
      if (cached) return cached;
      const result = calculate.budgetTriage(
        inputs.reportTransactions,
        inputs.categories,
        inputs.budgetTargets,
        inputs.recurringRules,
        today,
      );
      budgetTriageCache.set(today, result);
      return result;
    },
    goalOutlook(today) {
      const cached = goalOutlookCache.get(today);
      if (cached) return cached;
      const result = calculate.goalOutlook(
        inputs.goals,
        inputs.containers,
        inputs.ledgerTransactions,
        today,
      );
      goalOutlookCache.set(today, result);
      return result;
    },
    cashHorizon(today, days) {
      const key = `${today}:${days}`;
      const cached = cashHorizonCache.get(key);
      if (cached) return cached;
      const result = calculate.cashHorizon(
        inputs.ledgerTransactions,
        inputs.categories,
        inputs.containers,
        inputs.recurringRules,
        today,
        days,
      );
      cashHorizonCache.set(key, result);
      return result;
    },
    allocationMonth(today, manualIncome) {
      const key = `${today}:${manualIncome}`;
      const cached = allocationMonthCache.get(key);
      if (cached) return cached;
      const result = calculate.allocationPlanMonth({
        today,
        manualIncome,
        txns: inputs.ledgerTransactions,
        categories: inputs.categories,
        goals: inputs.goals,
        budgetTargets: inputs.budgetTargets,
        rules: inputs.recurringRules,
      });
      allocationMonthCache.set(key, result);
      return result;
    },
    allocationPayCycle(today, anchorRuleIds) {
      const normalized = anchorRuleIds ? [...anchorRuleIds].sort() : undefined;
      const key = `${today}:${normalized?.join(",") ?? "*"}`;
      if (allocationPayCycleCache.has(key)) {
        return allocationPayCycleCache.get(key)!;
      }
      const result = calculate.allocationPlanPayCycle({
        today,
        anchorRuleIds: normalized,
        txns: inputs.ledgerTransactions,
        categories: inputs.categories,
        goals: inputs.goals,
        budgetTargets: inputs.budgetTargets,
        rules: inputs.recurringRules,
      });
      allocationPayCycleCache.set(key, result);
      return result;
    },
  };
}
