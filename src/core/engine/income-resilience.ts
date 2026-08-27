import { addYears, format, subDays } from "date-fns";
import type { Category, RecurringRule, Transaction } from "../model";
import { isTransferRule } from "../model";
import { activeRows } from "./ledger";
import { monthKeysInRange, type DateRange } from "./period";
import { upcomingOccurrences } from "./recurring";

export type IncomeSourceClassification = "steady" | "variable" | "occasional";

export interface IncomeResilienceMonth {
  month: string;
  income: number;
}

export interface IncomeResilienceSource {
  key: string;
  label: string;
  total: number;
  share: number | null;
  monthly: number[];
  classification: IncomeSourceClassification;
}

export interface IncomeResilience {
  months: string[];
  monthly: IncomeResilienceMonth[];
  eligible: boolean;
  monthsNeeded: number;
  typicalMonthly: number | null;
  observedMin: number | null;
  observedMax: number | null;
  monthToMonthRange: number | null;
  sources: IncomeResilienceSource[];
  largestSourceShare: number | null;
  scheduledFixedMonthly: number;
}

function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const shifted = year * 12 + month - 1 + delta;
  const shiftedYear = Math.floor(shifted / 12);
  const shiftedMonth = ((shifted % 12) + 12) % 12;
  return shiftedYear + "-" + String(shiftedMonth + 1).padStart(2, "0");
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function displaySource(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

function sourceKey(value: string): string {
  return displaySource(value).toLowerCase();
}

function isNewer(candidate: Transaction, current: Transaction): boolean {
  const candidateTime = candidate.entered_at ?? candidate.date + "T00:00:00.000Z";
  const currentTime = current.entered_at ?? current.date + "T00:00:00.000Z";
  return (
    candidateTime > currentTime ||
    (candidateTime === currentTime && candidate.id > current.id)
  );
}

function classify(monthly: number[]): IncomeSourceClassification {
  const appeared = monthly.filter((amount) => amount !== 0).length;
  const typical = median(monthly);
  const steady =
    appeared === monthly.length &&
    typical !== 0 &&
    monthly.every((amount) => Math.abs(amount - typical) * 100 <= Math.abs(typical) * 5);
  if (steady) return "steady";
  return appeared * 2 < monthly.length ? "occasional" : "variable";
}

function fixedScheduledMonthly(
  rules: RecurringRule[],
  incomeCategoryIds: Set<string>,
  today: string,
): number {
  const eligible = rules.filter(
    (rule) =>
      rule.status === "active" &&
      !isTransferRule(rule) &&
      rule.template_category_id !== null &&
      incomeCategoryIds.has(rule.template_category_id) &&
      rule.template_amount !== null &&
      rule.template_amount > 0,
  );
  const end = format(
    subDays(addYears(new Date(today + "T00:00:00"), 1), 1),
    "yyyy-MM-dd",
  );
  const total = upcomingOccurrences(eligible, today, end, {
    limit: Number.MAX_SAFE_INTEGER,
  }).reduce((sum, occurrence) => sum + (occurrence.amount ?? 0), 0);
  return Math.round(total / 12);
}

/** Observed income variability over complete selected calendar months. */
export function incomeResilience(input: {
  today: string;
  range: DateRange;
  transactions: Transaction[];
  categories: Category[];
  recurringRules: RecurringRule[];
}): IncomeResilience {
  const currentMonth = input.today.slice(0, 7);
  const categoryTypes = new Map(
    input.categories
      .filter((category) => !category.excluded_from_stats)
      .map((category) => [category.id, category.type]),
  );
  const incomeCategoryIds = new Set(
    input.categories
      .filter((category) => category.type === "income" && !category.excluded_from_stats)
      .map((category) => category.id),
  );
  const approved = activeRows(input.transactions);
  const coveredRows = approved.filter(
    (row) => row.category_id !== null && categoryTypes.has(row.category_id),
  );
  const firstCovered = [...coveredRows].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  )[0];
  const firstCompleteMonth = firstCovered
    ? firstCovered.date.endsWith("-01")
      ? firstCovered.date.slice(0, 7)
      : shiftMonth(firstCovered.date.slice(0, 7), 1)
    : null;
  const months = monthKeysInRange(
    input.range,
    coveredRows.map((row) => row.date),
  ).filter(
    (month) =>
      month < currentMonth && firstCompleteMonth !== null && month >= firstCompleteMonth,
  );
  const selected = new Set(months);
  const incomeRows = approved.filter(
    (row) =>
      row.category_id !== null &&
      incomeCategoryIds.has(row.category_id) &&
      selected.has(row.date.slice(0, 7)),
  );
  const totals = new Map(months.map((month) => [month, 0]));
  const bySource = new Map<string, Map<string, number>>();
  const latestSpelling = new Map<string, Transaction>();
  for (const row of incomeRows) {
    const month = row.date.slice(0, 7);
    totals.set(month, (totals.get(month) ?? 0) + row.amount);
    const key = sourceKey(row.vendor_source);
    if (!key) continue;
    const sourceMonths = bySource.get(key) ?? new Map<string, number>();
    sourceMonths.set(month, (sourceMonths.get(month) ?? 0) + row.amount);
    bySource.set(key, sourceMonths);
    const latest = latestSpelling.get(key);
    if (!latest || isNewer(row, latest)) latestSpelling.set(key, row);
  }
  const monthly = months.map((month) => ({
    month,
    income: totals.get(month) ?? 0,
  }));
  const values = monthly.map((month) => month.income);
  const eligible = months.length >= 6;
  const totalIncome = values.reduce((sum, amount) => sum + amount, 0);
  const sources = eligible
    ? [...bySource].map(([key, sourceMonths]): IncomeResilienceSource => {
        const sourceMonthly = months.map((month) => sourceMonths.get(month) ?? 0);
        const total = sourceMonthly.reduce((sum, amount) => sum + amount, 0);
        return {
          key,
          label: displaySource(latestSpelling.get(key)?.vendor_source ?? key),
          total,
          share: totalIncome === 0 ? null : total / totalIncome,
          monthly: sourceMonthly,
          classification: classify(sourceMonthly),
        };
      })
    : [];
  sources.sort(
    (a, b) =>
      b.total - a.total || a.label.localeCompare(b.label) || a.key.localeCompare(b.key),
  );
  const observedMin = eligible ? Math.min(...values) : null;
  const observedMax = eligible ? Math.max(...values) : null;

  return {
    months,
    monthly,
    eligible,
    monthsNeeded: Math.max(0, 6 - months.length),
    typicalMonthly: eligible ? median(values) : null,
    observedMin,
    observedMax,
    monthToMonthRange:
      observedMin === null || observedMax === null ? null : observedMax - observedMin,
    sources,
    largestSourceShare: sources[0]?.share ?? null,
    scheduledFixedMonthly: fixedScheduledMonthly(
      input.recurringRules,
      incomeCategoryIds,
      input.today,
    ),
  };
}
