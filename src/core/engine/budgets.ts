import type { BudgetTarget } from "../model";

/**
 * "What was the budget on date X" (§5.3) — a budget row is effective from its
 * `start_date` until the next row for the same category begins, so resolution
 * is just "the latest row with `start_date <= date`," never the current/latest
 * value. Sorts before resolving so callers don't have to pre-sort or care about
 * arrival order (device merges land rows in arbitrary order).
 */
export function budgetOnDate(
  rows: BudgetTarget[],
  categoryId: string,
  date: string,
): number | null {
  let best: BudgetTarget | null = null;
  for (const row of rows) {
    if (row.category_id !== categoryId || row.start_date > date) continue;
    if (!best || row.start_date > best.start_date) best = row;
  }
  return best ? best.amount : null;
}
