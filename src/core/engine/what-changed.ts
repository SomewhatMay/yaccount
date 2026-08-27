import { differenceInCalendarDays } from "date-fns";
import type { Category, Transaction } from "../model";
import { activeRows } from "./ledger";
import { inRange, precedingRange, type DateRange } from "./period";
import { periodSummary } from "./reporting";

export type WhatChangedDriverKind = "expense" | "income";

export interface WhatChangedDriver {
  kind: WhatChangedDriverKind;
  key: string;
  label: string;
  contribution: number;
  currentLedgerAmount: number;
  previousLedgerAmount: number;
  categoryId: string | null;
  categoryIds: string[];
  source: string | null;
  likelyTiming: boolean;
}

export interface WhatChangedPeriod {
  income: number;
  expense: number;
  kept: number;
}

export interface WhatChanged {
  currentRange: DateRange;
  previousRange: DateRange;
  current: WhatChangedPeriod;
  previous: WhatChangedPeriod;
  changeInKept: number;
  drivers: WhatChangedDriver[];
  everythingElse: number;
  allDrivers: WhatChangedDriver[];
}

const TIMING_EDGE_DAYS = 3;

export function sourceDisplay(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

/** Locale-independent grouping key for free-text income sources. */
export function sourceKey(value: string): string {
  return sourceDisplay(value).toLowerCase();
}

function isNewer(candidate: Transaction, current: Transaction): boolean {
  if (candidate.date !== current.date) return candidate.date > current.date;
  const candidateEntered = candidate.entered_at ?? "";
  const currentEntered = current.entered_at ?? "";
  if (candidateEntered !== currentEntered) return candidateEntered > currentEntered;
  return candidate.id > current.id;
}

function nearEdge(date: string, range: DateRange): boolean {
  if (!range.start || !range.end) return false;
  const day = new Date(`${date}T00:00:00`);
  return (
    differenceInCalendarDays(day, new Date(`${range.start}T00:00:00`)) <=
      TIMING_EDGE_DAYS ||
    differenceInCalendarDays(new Date(`${range.end}T00:00:00`), day) <= TIMING_EDGE_DAYS
  );
}

function sumByKey(rows: Transaction[], keyOf: (row: Transaction) => string) {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row);
    sums.set(key, (sums.get(key) ?? 0) + row.amount);
  }
  return sums;
}

function period(summary: ReturnType<typeof periodSummary>): WhatChangedPeriod {
  return { income: summary.income, expense: summary.expense, kept: summary.saved };
}

/** Equal-period kept-money variance, decomposed into exact category/source drivers. */
export function whatChanged(
  transactions: Transaction[],
  categories: Category[],
  range: DateRange,
): WhatChanged | null {
  const previousRange = precedingRange(range);
  if (!previousRange) return null;

  const typeOf = new Map(categories.map((category) => [category.id, category.type]));
  const nameOf = new Map(categories.map((category) => [category.id, category.name]));
  const rows = activeRows(transactions).filter((row) => row.category_id !== null);
  const currentRows = rows.filter((row) => inRange(row.date, range));
  const previousRows = rows.filter((row) => inRange(row.date, previousRange));
  const currentExpenses = currentRows.filter(
    (row) => typeOf.get(row.category_id!) === "expense",
  );
  const previousExpenses = previousRows.filter(
    (row) => typeOf.get(row.category_id!) === "expense",
  );
  const currentIncome = currentRows.filter(
    (row) => typeOf.get(row.category_id!) === "income",
  );
  const previousIncome = previousRows.filter(
    (row) => typeOf.get(row.category_id!) === "income",
  );

  const currentExpenseSums = sumByKey(currentExpenses, (row) => row.category_id!);
  const previousExpenseSums = sumByKey(previousExpenses, (row) => row.category_id!);
  const currentIncomeSums = sumByKey(currentIncome, (row) =>
    sourceKey(row.vendor_source),
  );
  const previousIncomeSums = sumByKey(previousIncome, (row) =>
    sourceKey(row.vendor_source),
  );

  const latestIncomeSpelling = new Map<string, Transaction>();
  for (const row of [...previousIncome, ...currentIncome]) {
    const key = sourceKey(row.vendor_source);
    const latest = latestIncomeSpelling.get(key);
    if (!latest || isNewer(row, latest)) latestIncomeSpelling.set(key, row);
  }

  const allDrivers: WhatChangedDriver[] = [];
  const expenseIds = new Set([
    ...currentExpenseSums.keys(),
    ...previousExpenseSums.keys(),
  ]);
  for (const categoryId of expenseIds) {
    const currentLedgerAmount = currentExpenseSums.get(categoryId) ?? 0;
    const previousLedgerAmount = previousExpenseSums.get(categoryId) ?? 0;
    const contribution = currentLedgerAmount - previousLedgerAmount;
    if (contribution === 0) continue;
    allDrivers.push({
      kind: "expense",
      key: categoryId,
      label: nameOf.get(categoryId) ?? categoryId,
      contribution,
      currentLedgerAmount,
      previousLedgerAmount,
      categoryId,
      categoryIds: [categoryId],
      source: null,
      likelyTiming: false,
    });
  }

  const incomeKeys = new Set([...currentIncomeSums.keys(), ...previousIncomeSums.keys()]);
  for (const key of incomeKeys) {
    const currentLedgerAmount = currentIncomeSums.get(key) ?? 0;
    const previousLedgerAmount = previousIncomeSums.get(key) ?? 0;
    const contribution = currentLedgerAmount - previousLedgerAmount;
    if (contribution === 0) continue;
    const currentSourceRows = currentIncome.filter(
      (row) => sourceKey(row.vendor_source) === key,
    );
    const previousSourceRows = previousIncome.filter(
      (row) => sourceKey(row.vendor_source) === key,
    );
    const spelling = latestIncomeSpelling.get(key)?.vendor_source ?? key;
    allDrivers.push({
      kind: "income",
      key,
      label: sourceDisplay(spelling),
      contribution,
      currentLedgerAmount,
      previousLedgerAmount,
      categoryId: null,
      categoryIds: [
        ...new Set(
          [...currentSourceRows, ...previousSourceRows].map((row) => row.category_id!),
        ),
      ].sort(),
      source: sourceDisplay(spelling),
      likelyTiming:
        currentSourceRows.length > 0 &&
        previousSourceRows.length > 0 &&
        (currentSourceRows.some((row) => nearEdge(row.date, range)) ||
          previousSourceRows.some((row) => nearEdge(row.date, previousRange))),
    });
  }

  allDrivers.sort(
    (a, b) =>
      Math.abs(b.contribution) - Math.abs(a.contribution) ||
      a.kind.localeCompare(b.kind) ||
      a.key.localeCompare(b.key),
  );
  const current = period(periodSummary(transactions, categories, range));
  const previous = period(periodSummary(transactions, categories, previousRange));
  const changeInKept = current.kept - previous.kept;
  const drivers = allDrivers.slice(0, 4);
  const everythingElse =
    changeInKept - drivers.reduce((sum, driver) => sum + driver.contribution, 0);

  return {
    currentRange: range,
    previousRange,
    current,
    previous,
    changeInKept,
    drivers,
    everythingElse,
    allDrivers,
  };
}
