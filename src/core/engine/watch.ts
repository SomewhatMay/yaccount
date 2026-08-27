import { format, subDays } from "date-fns";
import type {
  BudgetTarget,
  Category,
  Container,
  RecurringRule,
  Transaction,
} from "../model";
import { activeRows } from "./ledger";
import { budgetOnDate } from "./budgets";
import { cashHorizon, type CashHorizon } from "./cash-horizon";

export interface ContainerWatch {
  containerId: string;
  currentBalance: number;
  netFlow30Days: number;
  forecast: CashHorizon;
  floor: number | null;
  distanceAboveFloor: number | null;
  floorBreached: boolean | null;
}

export interface CategoryWatchMonth {
  month: string;
  spent: number;
  budget: number | null;
  partial: boolean;
}

export interface CategoryWatch {
  categoryId: string;
  yearMonth: string;
  spent: number;
  budget: number | null;
  remaining: number | null;
  recent7DaySpend: number;
  likelyMonthEnd: number;
  sixMonthMedian: number;
  months: CategoryWatchMonth[];
}

function transactionDelta(row: Transaction, containerId: string): number {
  let delta = 0;
  if (row.container_id === containerId) delta += row.amount;
  if (row.to_container_id === containerId) delta -= row.amount;
  return delta;
}

/** One raw container balance plus its subject-only scheduled 30-day path. */
export function containerWatch(input: {
  today: string;
  containerId: string;
  floor: number | null;
  transactions: Transaction[];
  categories: Category[];
  containers: Container[];
  recurringRules: RecurringRule[];
  currentBalances?: ReadonlyMap<string, number>;
  balancesAsOfToday?: ReadonlyMap<string, number>;
}): ContainerWatch {
  const rows = activeRows(input.transactions);
  const currentBalance =
    input.currentBalances?.get(input.containerId) ??
    rows.reduce(
      (sum, row) =>
        row.date <= input.today ? sum + transactionDelta(row, input.containerId) : sum,
      0,
    );
  const flowStart = format(
    subDays(new Date(`${input.today}T00:00:00`), 29),
    "yyyy-MM-dd",
  );
  const netFlow30Days = rows.reduce(
    (sum, row) =>
      row.date >= flowStart && row.date <= input.today
        ? sum + transactionDelta(row, input.containerId)
        : sum,
    0,
  );
  const forecast = cashHorizon(
    input.transactions,
    input.categories,
    input.containers,
    input.recurringRules,
    input.today,
    30,
    [input.containerId],
    input.balancesAsOfToday,
  );
  const distanceAboveFloor =
    input.floor === null ? null : forecast.low.balance - input.floor;

  return {
    containerId: input.containerId,
    currentBalance,
    netFlow30Days,
    forecast,
    floor: input.floor,
    distanceAboveFloor,
    floorBreached: distanceAboveFloor === null ? null : distanceAboveFloor < 0,
  };
}

function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const shifted = year * 12 + month - 1 + delta;
  const shiftedYear = Math.floor(shifted / 12);
  const shiftedMonth = ((shifted % 12) + 12) % 12;
  return `${shiftedYear}-${String(shiftedMonth + 1).padStart(2, "0")}`;
}

function endOfMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${yearMonth}-${String(day).padStart(2, "0")}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round((sorted[2] + sorted[3]) / 2);
}

/** One stats-filtered expense category over the current and preceding five months. */
export function categoryWatch(input: {
  today: string;
  categoryId: string;
  transactions: Transaction[];
  budgetTargets: BudgetTarget[];
}): CategoryWatch {
  const yearMonth = input.today.slice(0, 7);
  const monthKeys = Array.from({ length: 6 }, (_, index) =>
    shiftMonth(yearMonth, index - 5),
  );
  const approved = activeRows(input.transactions).filter(
    (row) =>
      row.category_id === input.categoryId &&
      row.date <= input.today &&
      monthKeys.includes(row.date.slice(0, 7)),
  );
  const months = monthKeys.map((month): CategoryWatchMonth => {
    const signed = approved
      .filter((row) => row.date.startsWith(month))
      .reduce((sum, row) => sum + row.amount, 0);
    return {
      month,
      spent: signed === 0 ? 0 : -signed,
      budget: budgetOnDate(input.budgetTargets, input.categoryId, endOfMonth(month)),
      partial: month === yearMonth,
    };
  });
  const current = months.at(-1)!;
  const recentStart = format(
    subDays(new Date(`${input.today}T00:00:00`), 6),
    "yyyy-MM-dd",
  );
  const recentSigned = approved
    .filter((row) => row.date >= recentStart)
    .reduce((sum, row) => sum + row.amount, 0);
  const recent7DaySpend = recentSigned === 0 ? 0 : -recentSigned;
  const daysRemaining =
    Number(endOfMonth(yearMonth).slice(8)) - Number(input.today.slice(8));
  const likelyMonthEnd =
    current.spent + Math.round((recent7DaySpend * daysRemaining) / 7);

  return {
    categoryId: input.categoryId,
    yearMonth,
    spent: current.spent,
    budget: current.budget,
    remaining: current.budget === null ? null : current.budget - current.spent,
    recent7DaySpend,
    likelyMonthEnd,
    sixMonthMedian: median(months.map((month) => month.spent)),
    months,
  };
}
