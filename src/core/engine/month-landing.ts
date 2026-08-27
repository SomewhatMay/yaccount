import { addDays, format } from "date-fns";
import {
  recurringOccurrenceDate,
  type Category,
  type RecurringRule,
  type Transaction,
} from "../model";
import { isTransferRule } from "../model";
import { activeRows, pendingRows } from "./ledger";
import { upcomingOccurrences } from "./recurring";

export type MonthLandingScheduledSource = "approved-future" | "pending" | "recurring";

export interface MonthLandingScheduledItem {
  id: string;
  date: string;
  label: string;
  amount: number;
  source: MonthLandingScheduledSource;
  ruleId: string | null;
}

export interface MonthLandingUnknownItem {
  ruleId: string;
  date: string;
  label: string;
}

export interface MonthLandingRange {
  low: number;
  high: number;
}

export interface MonthLandingHistory {
  month: string;
  start: string;
  end: string;
  flexibleSpending: number;
}

export interface MonthLandingActualPoint {
  date: string;
  kept: number;
}

export interface MonthLanding {
  yearMonth: string;
  start: string;
  today: string;
  end: string;
  daysInMonth: number;
  elapsedDays: number;
  actualIncome: number;
  actualExpense: number;
  keptSoFar: number;
  actualPoints: MonthLandingActualPoint[];
  scheduledItems: MonthLandingScheduledItem[];
  unknownItems: MonthLandingUnknownItem[];
  remainingScheduledNet: number;
  usualFlexibleSpending: number | null;
  expectedRange: MonthLandingRange | null;
  likelyKept: number;
  history: MonthLandingHistory[];
  estimate: "scheduled-only" | "early" | "full";
}

function monthBounds(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${yearMonth}-01`,
    end: `${yearMonth}-${String(days).padStart(2, "0")}`,
    days,
  };
}

function nextDay(iso: string): string {
  return format(addDays(new Date(`${iso}T00:00:00`), 1), "yyyy-MM-dd");
}

function linkedKey(ruleId: string, date: string): string {
  return `${ruleId}:${date}`;
}

function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const shifted = year * 12 + month - 1 + delta;
  const shiftedYear = Math.floor(shifted / 12);
  const shiftedMonth = ((shifted % 12) + 12) % 12;
  return `${shiftedYear}-${String(shiftedMonth + 1).padStart(2, "0")}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** Current-month reporting actuals plus known future categorized flows. */
export function monthLanding(input: {
  today: string;
  transactions: Transaction[];
  categories: Category[];
  recurringRules: RecurringRule[];
}): MonthLanding {
  const yearMonth = input.today.slice(0, 7);
  const bounds = monthBounds(yearMonth);
  const categoryTypes = new Map(
    input.categories
      .filter((category) => !category.excluded_from_stats)
      .map((category) => [category.id, category.type]),
  );
  const approved = activeRows(input.transactions);
  const categorized = (row: Transaction) =>
    row.category_id !== null && categoryTypes.has(row.category_id);

  let actualIncome = 0;
  let actualExpenseSigned = 0;
  const actualByDate = new Map<string, number>();
  for (const row of approved) {
    if (row.date < bounds.start || row.date > input.today || !categorized(row)) {
      continue;
    }
    const type = categoryTypes.get(row.category_id!);
    if (type === "income") actualIncome += row.amount;
    else if (type === "expense") actualExpenseSigned += row.amount;
    actualByDate.set(row.date, (actualByDate.get(row.date) ?? 0) + row.amount);
  }
  const actualExpense = actualExpenseSigned === 0 ? 0 : -actualExpenseSigned;
  const keptSoFar = actualIncome - actualExpense;
  let runningKept = 0;
  const actualPoints: MonthLandingActualPoint[] = [{ date: bounds.start, kept: 0 }];
  for (const [date, delta] of [...actualByDate].sort(([a], [b]) => a.localeCompare(b))) {
    runningKept += delta;
    actualPoints.push({ date, kept: runningKept });
  }
  if (actualPoints.at(-1)?.date !== input.today) {
    actualPoints.push({ date: input.today, kept: runningKept });
  }

  const currentApproved = approved.filter(
    (row) => row.date >= bounds.start && row.date <= bounds.end && categorized(row),
  );
  const currentPending = pendingRows(input.transactions).filter(
    (row) =>
      recurringOccurrenceDate(row) >= bounds.start &&
      recurringOccurrenceDate(row) <= bounds.end &&
      row.recurring_rule_id !== null &&
      categorized(row),
  );
  const approvedLinked = new Set(
    approved.flatMap((row) =>
      row.recurring_rule_id &&
      recurringOccurrenceDate(row) >= bounds.start &&
      recurringOccurrenceDate(row) <= bounds.end &&
      categorized(row)
        ? [linkedKey(row.recurring_rule_id, recurringOccurrenceDate(row))]
        : [],
    ),
  );
  const represented = new Set(approvedLinked);
  const scheduledItems: MonthLandingScheduledItem[] = currentApproved
    .filter((row) => row.date > input.today)
    .map((row) => ({
      id: row.id,
      date: row.date,
      label: row.vendor_source,
      amount: row.amount,
      source: "approved-future" as const,
      ruleId: row.recurring_rule_id,
    }));

  for (const row of currentPending) {
    const key = linkedKey(row.recurring_rule_id!, recurringOccurrenceDate(row));
    represented.add(key);
    if (approvedLinked.has(key)) continue;
    scheduledItems.push({
      id: row.id,
      date: row.date,
      label: row.vendor_source,
      amount: row.amount,
      source: "pending",
      ruleId: row.recurring_rule_id,
    });
  }

  const unknownItems: MonthLandingUnknownItem[] = [];
  const occurrenceStart = nextDay(input.today);
  if (occurrenceStart <= bounds.end) {
    const rules = input.recurringRules.filter(
      (rule) =>
        !isTransferRule(rule) &&
        rule.template_category_id !== null &&
        categoryTypes.has(rule.template_category_id),
    );
    for (const occurrence of upcomingOccurrences(rules, occurrenceStart, bounds.end, {
      limit: Number.MAX_SAFE_INTEGER,
    })) {
      if (represented.has(linkedKey(occurrence.rule.id, occurrence.date))) {
        continue;
      }
      if (occurrence.amount === null) {
        unknownItems.push({
          ruleId: occurrence.rule.id,
          date: occurrence.date,
          label: occurrence.rule.template_vendor_source,
        });
        continue;
      }
      scheduledItems.push({
        id: `${occurrence.rule.id}:${occurrence.date}`,
        date: occurrence.date,
        label: occurrence.rule.template_vendor_source,
        amount: occurrence.amount,
        source: "recurring",
        ruleId: occurrence.rule.id,
      });
    }
  }

  scheduledItems.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.label.localeCompare(b.label) ||
      a.id.localeCompare(b.id),
  );
  unknownItems.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.label.localeCompare(b.label) ||
      a.ruleId.localeCompare(b.ruleId),
  );
  const remainingScheduledNet = scheduledItems.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const firstHistorical = approved
    .filter((row) => row.date < bounds.start && categorized(row))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];
  const firstCompleteMonth = firstHistorical
    ? firstHistorical.date.endsWith("-01")
      ? firstHistorical.date.slice(0, 7)
      : shiftMonth(firstHistorical.date.slice(0, 7), 1)
    : null;
  const historyMonths = [-3, -2, -1]
    .map((delta) => shiftMonth(yearMonth, delta))
    .filter((month) => firstCompleteMonth !== null && month >= firstCompleteMonth);
  const elapsedDays = Number(input.today.slice(8));
  const history = historyMonths.map((month): MonthLandingHistory => {
    const historical = monthBounds(month);
    const firstRemainingDay =
      Math.floor((elapsedDays / bounds.days) * historical.days) + 1;
    const start =
      firstRemainingDay > historical.days
        ? `${shiftMonth(month, 1)}-01`
        : `${month}-${String(firstRemainingDay).padStart(2, "0")}`;
    const signed = approved
      .filter(
        (row) =>
          row.date >= start &&
          row.date <= historical.end &&
          row.recurring_rule_id === null &&
          row.category_id !== null &&
          categoryTypes.get(row.category_id) === "expense",
      )
      .reduce((sum, row) => sum + row.amount, 0);
    return {
      month,
      start,
      end: historical.end,
      flexibleSpending: signed === 0 ? 0 : -signed,
    };
  });
  const flexibleValues = history.map((item) => item.flexibleSpending);
  const usualFlexibleSpending =
    flexibleValues.length >= 2 ? median(flexibleValues) : null;
  const base = keptSoFar + remainingScheduledNet;
  const expectedRange =
    flexibleValues.length >= 2
      ? {
          low: base - Math.max(...flexibleValues),
          high: base - Math.min(...flexibleValues),
        }
      : null;
  const estimate =
    history.length >= 3 ? "full" : history.length === 2 ? "early" : "scheduled-only";

  return {
    yearMonth,
    start: bounds.start,
    today: input.today,
    end: bounds.end,
    daysInMonth: bounds.days,
    elapsedDays,
    actualIncome,
    actualExpense,
    keptSoFar,
    actualPoints,
    scheduledItems,
    unknownItems,
    remainingScheduledNet,
    usualFlexibleSpending,
    expectedRange,
    likelyKept: base - (usualFlexibleSpending ?? 0),
    history,
    estimate,
  };
}
