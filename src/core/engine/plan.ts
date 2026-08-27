import type { BudgetTarget, Category, Goal, RecurringRule, Transaction } from "../model";
import { isTransferRule } from "../model";
import { budgetOnDate } from "./budgets";
import { requiredMonthly } from "./goals";
import type { GoalLedgerFacts } from "./goals";
import { firstOccurrenceOnOrAfter, nextOccurrence } from "./recurring";

/**
 * The Monthly Allocation Plan (§6.8) — the product thesis made mechanical. A live,
 * entirely view-time-derived statement that forces every earned dollar to be
 * claimed by a *flow* (a category allowance) or a *stock* (a goal contribution):
 *
 *   Income expected − Σ category allowances − Σ goal asks = Unallocated
 *
 * Nothing here is stored; the plan is a single live query over the ledger, budgets,
 * goals, and recurring rules. Over-allocation is flagged (Unallocated goes red),
 * never blocked (§5.2 negative-balance stance).
 */

type ISO = string;
type YearMonth = string; // "2026-07"

function monthBounds(yearMonth: YearMonth): { start: ISO; end: ISO } {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${yearMonth}-01`,
    end: `${yearMonth}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * How many times a rule comes due within a calendar month — the multiplier for
 * recurring income (§6.8). Walks the occurrence grid from the month start; honors
 * `start_date`/`end_date` bounds and skips cancelled rules.
 */
export function occurrencesInMonth(rule: RecurringRule, yearMonth: YearMonth): number {
  if (rule.status === "cancelled") return 0;
  const { start, end } = monthBounds(yearMonth);
  const from = start > rule.start_date ? start : rule.start_date;
  let count = 0;
  let cursor = firstOccurrenceOnOrAfter(rule, from);
  let guard = 0;
  while (cursor <= end && guard++ < 1000) {
    if (rule.end_date !== null && cursor > rule.end_date) break;
    count++;
    cursor = nextOccurrence(rule, cursor);
  }
  return count;
}

export interface ExpectedIncome {
  total: number; // cents
  covered: boolean; // true if ≥1 income rule reaches this month (recurring wins, §6.8)
}

/**
 * `Income expected` from recurring rules (§6.8): Σ over active **income** rules of
 * `occurrences_this_month × template_amount`. A rule is income if its category is
 * an income category (not a transfer, not an expense). `covered` tells the plan
 * whether to prefer this over the user's manual figure.
 */
export function expectedIncomeFromRules(
  rules: RecurringRule[],
  categories: Category[],
  yearMonth: YearMonth,
): ExpectedIncome {
  const incomeCats = new Set(
    categories.filter((c) => c.type === "income").map((c) => c.id),
  );
  let total = 0;
  let covered = false;
  for (const rule of rules) {
    if (rule.status !== "active" || isTransferRule(rule)) continue;
    if (!rule.template_category_id || !incomeCats.has(rule.template_category_id))
      continue;
    const n = occurrencesInMonth(rule, yearMonth);
    if (n === 0) continue;
    covered = true;
    total += n * (rule.template_amount ?? 0);
  }
  return { total, covered };
}

export interface PlanAllowance {
  categoryId: string;
  name: string;
  amount: number; // the category's active monthly budget (cents)
}
export interface PlanAsk {
  goalId: string;
  name: string;
  amount: number; // required_monthly (cents)
}

export interface MonthlyPlan {
  yearMonth: YearMonth;
  income: number;
  incomeFromRules: boolean; // false ⇒ the manual figure was used
  allowances: PlanAllowance[];
  totalAllowances: number;
  asks: PlanAsk[];
  totalAsks: number;
  unallocated: number; // income − allowances − asks
  overAllocated: boolean; // unallocated < 0
}

/**
 * Assemble the plan (§6.8). Income comes from recurring income rules when any
 * cover the month, else the user's manual figure. Allowances are each non-archived
 * expense category's budget active this month (§5.3, resolved at month end). Asks
 * are each active, non-archived goal's `required_monthly` per its mode (§5.9.4).
 */
export function monthlyPlan(input: {
  yearMonth: YearMonth;
  today: ISO;
  txns: Transaction[];
  goalFacts?: ReadonlyMap<string, GoalLedgerFacts>;
  categories: Category[];
  goals: Goal[];
  budgetTargets: BudgetTarget[];
  rules: RecurringRule[];
  manualIncome: number;
}): MonthlyPlan {
  const { yearMonth, today, txns, categories, goals, budgetTargets, rules } = input;
  const { end } = monthBounds(yearMonth);

  const fromRules = expectedIncomeFromRules(rules, categories, yearMonth);
  const incomeFromRules = fromRules.covered;
  const income = incomeFromRules ? fromRules.total : input.manualIncome;

  // Flow: a steady monthly allowance per non-archived expense category (§6.8).
  const allowances: PlanAllowance[] = [];
  for (const c of categories) {
    if (c.type !== "expense" || c.is_archived) continue;
    const amount = budgetOnDate(budgetTargets, c.id, end);
    if (amount === null || amount === 0) continue;
    allowances.push({ categoryId: c.id, name: c.name, amount });
  }
  const totalAllowances = allowances.reduce((s, a) => s + a.amount, 0);

  // Stock: each active goal's per-mode ask (§5.9.4). Archived/cancelled/completed
  // goals no longer claim a dollar.
  const asks: PlanAsk[] = [];
  for (const g of goals) {
    if (g.status !== "active" || g.is_archived) continue;
    const ledger = input.goalFacts?.get(g.id) ?? txns;
    const amount = requiredMonthly(g, ledger, today);
    if (amount === 0) continue;
    asks.push({ goalId: g.id, name: g.name ?? "Goal", amount });
  }
  const totalAsks = asks.reduce((s, a) => s + a.amount, 0);

  const unallocated = income - totalAllowances - totalAsks;
  return {
    yearMonth,
    income,
    incomeFromRules,
    allowances,
    totalAllowances,
    asks,
    totalAsks,
    unallocated,
    overAllocated: unallocated < 0,
  };
}
