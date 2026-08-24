import { differenceInCalendarDays } from "date-fns";
import {
  isTransferRule,
  recurringOccurrenceDate,
  type BudgetTarget,
  type Category,
  type Container,
  type ContainerSnapshot,
  type RecurringRule,
  type Transaction,
} from "../model";
import { budgetOnDate } from "./budgets";
import { activeRows, pendingRows } from "./ledger";
import { upcomingOccurrences } from "./recurring";

export interface MonthCloseCandidate {
  transactionId: string;
  date: string;
  label: string;
  amount: number;
  dayDistance: number;
  sourceMatches: boolean;
}

export interface MonthCloseOccurrence {
  ruleId: string;
  date: string;
  label: string;
  amount: number | null;
  pendingTransactionId: string | null;
  candidates: MonthCloseCandidate[];
}

export interface MonthCloseBudgetOverage {
  categoryId: string;
  name: string;
  budget: number;
  spent: number;
  over: number;
}

export interface MonthCloseStaleValues {
  staleCount: number;
  missingCount: number;
  oldestAgeDays: number | null;
}

export interface MonthClose {
  yearMonth: string;
  start: string;
  end: string;
  pendingCount: number;
  pendingTransactionIds: string[];
  overBudget: MonthCloseBudgetOverage[];
  unmatchedOccurrences: MonthCloseOccurrence[];
  staleValues: MonthCloseStaleValues;
  completedTaskCount: number;
  totalTaskCount: 4;
}

function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function previousMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

/** The one month eligible for close work today, or null outside its short window. */
export function closeMonthKey(today: string): string | null {
  const yearMonth = today.slice(0, 7);
  const day = Number(today.slice(8));
  if (day <= 5) return previousMonth(yearMonth);
  return day >= daysInMonth(yearMonth) - 2 ? yearMonth : null;
}

function linkedKey(ruleId: string, occurrenceDate: string): string {
  return `${ruleId}:${occurrenceDate}`;
}

function normalizedSource(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

function dateDistance(a: string, b: string): number {
  return Math.abs(
    differenceInCalendarDays(new Date(`${a}T00:00:00`), new Date(`${b}T00:00:00`)),
  );
}

function latestInvestmentValues(
  today: string,
  containers: readonly Container[],
  snapshots: readonly ContainerSnapshot[],
): MonthCloseStaleValues {
  const latest = new Map<string, ContainerSnapshot>();
  for (const snapshot of snapshots) {
    const current = latest.get(snapshot.container_id);
    if (
      !current ||
      snapshot.date > current.date ||
      (snapshot.date === current.date && snapshot.id > current.id)
    ) {
      latest.set(snapshot.container_id, snapshot);
    }
  }
  let missingCount = 0;
  const staleAges: number[] = [];
  for (const container of containers) {
    if (!container.is_investment || container.is_archived) continue;
    const snapshot = latest.get(container.id);
    if (!snapshot) {
      missingCount += 1;
      continue;
    }
    const age = Math.max(
      0,
      differenceInCalendarDays(
        new Date(`${today}T00:00:00`),
        new Date(`${snapshot.date}T00:00:00`),
      ),
    );
    if (age > 30) staleAges.push(age);
  }
  return {
    staleCount: staleAges.length,
    missingCount,
    oldestAgeDays: staleAges.length > 0 ? Math.max(...staleAges) : null,
  };
}

function budgetOverages(input: {
  yearMonth: string;
  end: string;
  today: string;
  transactions: Transaction[];
  categories: Category[];
  budgetTargets: BudgetTarget[];
}): MonthCloseBudgetOverage[] {
  const approved = activeRows(input.transactions);
  return input.categories
    .flatMap((category): MonthCloseBudgetOverage[] => {
      if (
        category.type !== "expense" ||
        category.is_archived ||
        category.excluded_from_stats
      ) {
        return [];
      }
      const budget = budgetOnDate(input.budgetTargets, category.id, input.end);
      if (budget === null) return [];
      const signed = approved.reduce(
        (total, row) =>
          row.category_id === category.id &&
          row.date.slice(0, 7) === input.yearMonth &&
          row.date <= input.today
            ? total + row.amount
            : total,
        0,
      );
      const spent = signed === 0 ? 0 : -signed;
      return spent > budget
        ? [
            {
              categoryId: category.id,
              name: category.name,
              budget,
              spent,
              over: spent - budget,
            },
          ]
        : [];
    })
    .sort(
      (a, b) =>
        b.over - a.over ||
        a.name.localeCompare(b.name) ||
        a.categoryId.localeCompare(b.categoryId),
    );
}

/** Pure close checklist. Candidate entries never count until explicitly linked. */
export function monthClose(input: {
  today: string;
  transactions: Transaction[];
  categories: Category[];
  containers: Container[];
  snapshots: ContainerSnapshot[];
  budgetTargets: BudgetTarget[];
  recurringRules: RecurringRule[];
}): MonthClose | null {
  const yearMonth = closeMonthKey(input.today);
  if (!yearMonth) return null;
  const start = `${yearMonth}-01`;
  const end = `${yearMonth}-${String(daysInMonth(yearMonth)).padStart(2, "0")}`;
  const approved = activeRows(input.transactions);
  const pending = pendingRows(input.transactions).filter(
    (row) => recurringOccurrenceDate(row).slice(0, 7) === yearMonth,
  );
  const linked = new Set(
    approved.flatMap((row) =>
      row.recurring_rule_id !== null && row.date <= input.today
        ? [linkedKey(row.recurring_rule_id, recurringOccurrenceDate(row))]
        : [],
    ),
  );
  const pendingByOccurrence = new Map(
    pending.flatMap((row) =>
      row.recurring_rule_id
        ? [[linkedKey(row.recurring_rule_id, recurringOccurrenceDate(row)), row.id]]
        : [],
    ),
  );
  const manual = approved.filter(
    (row) => row.recurring_rule_id === null && row.date <= input.today,
  );
  const eligibleRules = input.recurringRules.filter(
    (rule) => !isTransferRule(rule) && rule.template_category_id !== null,
  );
  const unmatchedOccurrences = upcomingOccurrences(eligibleRules, start, end, {
    limit: Number.MAX_SAFE_INTEGER,
  }).flatMap((occurrence): MonthCloseOccurrence[] => {
    const rule = occurrence.rule;
    const key = linkedKey(rule.id, occurrence.date);
    if (linked.has(key)) return [];
    const expectedSource = normalizedSource(rule.template_vendor_source);
    const candidates =
      occurrence.amount === null
        ? []
        : manual
            .filter(
              (row) =>
                row.category_id === rule.template_category_id &&
                row.container_id === rule.template_container_id &&
                row.to_container_id === null &&
                row.amount === occurrence.amount &&
                dateDistance(row.date, occurrence.date) <= 7,
            )
            .map((row): MonthCloseCandidate => ({
              transactionId: row.id,
              date: row.date,
              label: row.vendor_source,
              amount: row.amount,
              dayDistance: dateDistance(row.date, occurrence.date),
              sourceMatches: normalizedSource(row.vendor_source) === expectedSource,
            }))
            .sort(
              (a, b) =>
                Number(b.sourceMatches) - Number(a.sourceMatches) ||
                a.dayDistance - b.dayDistance ||
                a.date.localeCompare(b.date) ||
                a.label.localeCompare(b.label) ||
                a.transactionId.localeCompare(b.transactionId),
            );
    return [
      {
        ruleId: rule.id,
        date: occurrence.date,
        label: rule.template_vendor_source,
        amount: occurrence.amount,
        pendingTransactionId: pendingByOccurrence.get(key) ?? null,
        candidates,
      },
    ];
  });
  const overBudget = budgetOverages({
    yearMonth,
    end,
    today: input.today,
    transactions: input.transactions,
    categories: input.categories,
    budgetTargets: input.budgetTargets,
  });
  const staleValues = latestInvestmentValues(
    input.today,
    input.containers,
    input.snapshots,
  );
  const completedTaskCount = [
    pending.length === 0,
    overBudget.length === 0,
    unmatchedOccurrences.length === 0,
    staleValues.staleCount + staleValues.missingCount === 0,
  ].filter(Boolean).length;

  return {
    yearMonth,
    start,
    end,
    pendingCount: pending.length,
    pendingTransactionIds: pending.map((row) => row.id).sort(),
    overBudget,
    unmatchedOccurrences,
    staleValues,
    completedTaskCount,
    totalTaskCount: 4,
  };
}
