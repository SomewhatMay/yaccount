import type { Category, CategoryType, BudgetTarget, Transaction } from "../model";
import { activeRows } from "./ledger";
import { budgetOnDate } from "./budgets";
import { inRange, monthKeysInRange, monthsInRange, type DateRange } from "./period";

/**
 * The §6 derived-view layer. Every aggregation here runs over `activeRows`
 * (`ledger.ts` — voided rows, their reversals, and templates already dropped) and
 * excludes transfers from category/income/expense math (a transfer has
 * `category_id === null`; no money left the user's possession, §5.4). Money stays
 * integer cents; monthly *averages* are the one place a fractional-then-rounded
 * cent is acceptable (a derived statistic, never stored). Callers pass a resolved
 * `DateRange` (§6.1) so the same functions serve any period or the compare ranges.
 */

export interface CategorySlice {
  categoryId: string;
  name: string;
  amount: number; // magnitude in cents
}

export interface MonthlyTotal {
  month: string; // "YYYY-MM"
  income: number; // cents
  expense: number; // cents, positive magnitude of outflow
  savings: number; // income − expense (may be negative)
}

/** Category rows in the window, by type, that are real ledger entries. */
function categorized(
  txns: Transaction[],
  categories: Category[],
  range: DateRange,
): {
  rows: Transaction[];
  typeOf: Map<string, CategoryType>;
  nameOf: Map<string, string>;
} {
  const typeOf = new Map(categories.map((c) => [c.id, c.type]));
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));
  const rows = activeRows(txns).filter(
    (t) => t.category_id !== null && inRange(t.date, range),
  );
  return { rows, typeOf, nameOf };
}

/** Net signed cents per category id (only the given type). */
function sumByCategory(
  rows: Transaction[],
  typeOf: Map<string, CategoryType>,
  type: CategoryType,
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const t of rows) {
    const cid = t.category_id!;
    if (typeOf.get(cid) !== type) continue;
    sums.set(cid, (sums.get(cid) ?? 0) + t.amount);
  }
  return sums;
}

/**
 * Per-category spend/income for the window (§6.5 doughnuts). Signed sums net
 * refunds within a category, then the magnitude is charted. **Genuine
 * zero-filtering** (§6.4): a category that nets to $0 is dropped entirely.
 * Sorted largest-first.
 */
export function categoryBreakdown(
  txns: Transaction[],
  categories: Category[],
  range: DateRange,
  opts: { type: CategoryType },
): CategorySlice[] {
  const { rows, typeOf, nameOf } = categorized(txns, categories, range);
  const sums = sumByCategory(rows, typeOf, opts.type);
  const out: CategorySlice[] = [];
  for (const [cid, sum] of sums) {
    const amount = Math.abs(sum);
    if (amount === 0) continue;
    out.push({ categoryId: cid, name: nameOf.get(cid) ?? cid, amount });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

/** The period-monthly-average variant of the breakdown (§6.5): each amount ÷ the
 * window's month count, rounded to the cent. */
export function categoryBreakdownMonthlyAverage(
  txns: Transaction[],
  categories: Category[],
  range: DateRange,
  opts: { type: CategoryType },
): CategorySlice[] {
  const rows = activeRows(txns).filter(
    (t) => t.category_id !== null && inRange(t.date, range),
  );
  const months = monthsInRange(
    range,
    rows.map((t) => t.date),
  );
  return categoryBreakdown(txns, categories, range, opts).map((s) => ({
    ...s,
    amount: Math.round(s.amount / months),
  }));
}

/**
 * Income / expense / savings per month across the window (§6.5 monthly bar).
 * Income = Σ over income-type categories; expense = the outflow magnitude
 * (−Σ over expense-type categories, so refunds reduce it); savings = income −
 * expense. Empty months in the window still appear (a zero bar). Transfers excluded.
 */
export function monthlyTotals(
  txns: Transaction[],
  categories: Category[],
  range: DateRange,
): MonthlyTotal[] {
  const { rows, typeOf } = categorized(txns, categories, range);
  const keys = monthKeysInRange(
    range,
    rows.map((t) => t.date),
  );
  const income = new Map<string, number>();
  const expenseSigned = new Map<string, number>();
  for (const t of rows) {
    const type = typeOf.get(t.category_id!);
    const bucket = t.date.slice(0, 7);
    if (type === "income") income.set(bucket, (income.get(bucket) ?? 0) + t.amount);
    else if (type === "expense")
      expenseSigned.set(bucket, (expenseSigned.get(bucket) ?? 0) + t.amount);
  }
  return keys.map((month) => {
    const inc = income.get(month) ?? 0;
    const rawExp = expenseSigned.get(month) ?? 0;
    const exp = rawExp === 0 ? 0 : -rawExp; // signed sum is negative → positive magnitude (normalize -0)
    return { month, income: inc, expense: exp, savings: inc - exp };
  });
}

/**
 * One category's spend per month against its **time-variant** budget (§6.5
 * drill-down): the budget is resolved at the first of each month (`budgetOnDate`,
 * §5.3), never the current value — a historical month shows the budget that was
 * in effect then.
 */
export function categoryMonthlySpend(
  txns: Transaction[],
  categoryId: string,
  range: DateRange,
  budgetTargets: BudgetTarget[],
): { month: string; spend: number; budget: number | null }[] {
  const rows = activeRows(txns).filter(
    (t) => t.category_id === categoryId && inRange(t.date, range),
  );
  const keys = monthKeysInRange(
    range,
    rows.map((t) => t.date),
  );
  const signed = new Map<string, number>();
  for (const t of rows)
    signed.set(t.date.slice(0, 7), (signed.get(t.date.slice(0, 7)) ?? 0) + t.amount);
  return keys.map((month) => ({
    month,
    spend: Math.abs(signed.get(month) ?? 0),
    budget: budgetOnDate(budgetTargets, categoryId, `${month}-01`),
  }));
}

/**
 * The total expense-budget allowance in effect on a date (§6.5 monthly-bar
 * overlay): the sum of every expense category's time-variant budget resolved at
 * that date (`budgetOnDate`, §5.3), a null budget counting as 0. Drives the
 * budget reference line on the monthly income/expense/savings chart.
 */
export function totalExpenseBudgetOnDate(
  budgetTargets: BudgetTarget[],
  categories: Category[],
  date: string,
): number {
  let sum = 0;
  for (const c of categories) {
    if (c.type !== "expense") continue;
    sum += budgetOnDate(budgetTargets, c.id, date) ?? 0;
  }
  return sum;
}

/** Collapse a monthly series into the Income → Expenses → Savings waterfall
 * totals (§6.5). The chart draws these three as a stacked bar with a transparent
 * base (impl §10 #28) — no second chart library. */
export function waterfallData(totals: MonthlyTotal[]): {
  income: number;
  expenses: number;
  savings: number;
} {
  const income = totals.reduce((s, m) => s + m.income, 0);
  const expenses = totals.reduce((s, m) => s + m.expense, 0);
  return { income, expenses, savings: income - expenses };
}

export interface BudgetComparisonRow {
  categoryId: string;
  name: string;
  actualMonthlyAvg: number; // cents, rounded
  budget: number | null; // cents, the target in effect over the window
  deltaPct: number | null; // (actual − budget) / budget * 100
}

/**
 * Actual monthly-average spend vs. budget, per expense category, **re-scoped to
 * the active period** (§6.3) — deliberately not the spreadsheet's all-time
 * average. The budget in effect is resolved at the window's end (`budgetOnDate`);
 * for an unbounded window it uses the latest logged date. Categories with neither
 * a budget nor any spend are omitted.
 */
export function budgetComparison(
  txns: Transaction[],
  categories: Category[],
  range: DateRange,
  budgetTargets: BudgetTarget[],
): BudgetComparisonRow[] {
  const { rows, typeOf, nameOf } = categorized(txns, categories, range);
  const months = monthsInRange(
    range,
    rows.map((t) => t.date),
  );
  const spendSigned = sumByCategory(rows, typeOf, "expense");
  const asOf =
    range.end ??
    (rows.length ? rows.reduce((m, t) => (t.date > m ? t.date : m), rows[0].date) : null);

  const ids = new Set<string>(spendSigned.keys());
  for (const bt of budgetTargets) {
    if (typeOf.get(bt.category_id) === "expense") ids.add(bt.category_id);
  }

  const out: BudgetComparisonRow[] = [];
  for (const cid of ids) {
    const actualMonthlyAvg = Math.round(Math.abs(spendSigned.get(cid) ?? 0) / months);
    const budget = asOf ? budgetOnDate(budgetTargets, cid, asOf) : null;
    if (actualMonthlyAvg === 0 && budget === null) continue;
    const deltaPct =
      budget && budget !== 0 ? ((actualMonthlyAvg - budget) / budget) * 100 : null;
    out.push({
      categoryId: cid,
      name: nameOf.get(cid) ?? cid,
      actualMonthlyAvg,
      budget,
      deltaPct,
    });
  }
  return out.sort((a, b) => b.actualMonthlyAvg - a.actualMonthlyAvg);
}
