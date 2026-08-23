import {
  monthlyTotals,
  moneyMap as deriveMoneyMap,
  overallBalance,
  periodSummary,
  upcomingOccurrences,
  type DateRange,
} from "@/core/engine";
import type {
  Category,
  Container,
  ContainerSnapshot,
  Goal,
  RecurringRule,
  Transaction,
} from "@/core/model";

export interface DashboardAggregateInputs {
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
}

export interface DashboardAggregates {
  monthly: (range: DateRange) => ReturnType<typeof monthlyTotals>;
  period: (range: DateRange) => ReturnType<typeof periodSummary>;
  balance: () => number;
  occurrences: (from: string, to: string) => ReturnType<typeof upcomingOccurrences>;
  moneyMap: () => ReturnType<typeof deriveMoneyMap>;
}

const defaultCalculators: DashboardAggregateCalculators = {
  monthlyTotals,
  periodSummary,
  overallBalance,
  upcomingOccurrences,
  moneyMap: deriveMoneyMap,
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
  };
}
