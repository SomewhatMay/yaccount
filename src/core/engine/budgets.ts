import type { BudgetTarget, Category, Transaction } from "../model";
import { activeRows } from "./ledger";
import { inRange } from "./period";

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

export interface BudgetPace {
  spent: number; // cents out this month, positive magnitude
  budget: number; // Σ expense allowances in effect for the month (0 = none set)
  remaining: number; // budget − spent; negative once it is overspent
  monthElapsedPct: number; // 0…1, how much of the month has passed
  spentPct: number | null; // spent / budget; null when no budget is set
  projected: number; // where this month lands at the current rate
  onPace: boolean; // the projection fits inside the allowance
  daysLeft: number;
}

/** Days in a "YYYY-MM" key, leap years honoured. */
function daysInYearMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Spending measured against the month's own clock (M11) — the one number a
 * budget screen owes you that a bar of "71% spent" does not: **is 71% early or
 * late?** 71% of the allowance on the 8th is a problem; on the 26th it is fine.
 *
 * The allowance is the one in effect at the END of the month (`budgetOnDate`,
 * §5.3), matching the Monthly Allocation Plan (§6.8) — a raise mid-month is this
 * month's allowance, not next month's.
 *
 * Pure and clock-free: `today` is the caller's. Outside the month it clamps
 * rather than extrapolating — a month not yet begun has nothing to extrapolate
 * FROM, so it projects exactly what is already booked instead of dividing by zero.
 */
export function budgetPace(
  txns: Transaction[],
  categories: Category[],
  budgetTargets: BudgetTarget[],
  yearMonth: string,
  today: string,
): BudgetPace {
  const days = daysInYearMonth(yearMonth);
  const end = `${yearMonth}-${String(days).padStart(2, "0")}`;
  const range = { start: `${yearMonth}-01`, end };

  const expenseIds = new Set(
    categories.filter((c) => c.type === "expense").map((c) => c.id),
  );
  let signed = 0;
  for (const t of activeRows(txns)) {
    if (t.category_id === null || !expenseIds.has(t.category_id)) continue;
    if (!inRange(t.date, range)) continue;
    signed += t.amount;
  }
  const spent = signed === 0 ? 0 : -signed; // outflow is negative → magnitude

  let budget = 0;
  for (const id of expenseIds) budget += budgetOnDate(budgetTargets, id, end) ?? 0;

  const elapsedDays =
    today < range.start ? 0 : today >= end ? days : Number(today.slice(8));
  const monthElapsedPct = elapsedDays / days;
  const projected = monthElapsedPct > 0 ? Math.round(spent / monthElapsedPct) : spent;

  return {
    spent,
    budget,
    remaining: budget - spent,
    monthElapsedPct,
    spentPct: budget === 0 ? null : spent / budget,
    projected,
    onPace: projected <= budget,
    daysLeft: days - elapsedDays,
  };
}
