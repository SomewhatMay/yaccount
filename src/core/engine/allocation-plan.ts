import { addDays, differenceInCalendarDays, format } from "date-fns";
import type { BudgetTarget, Category, Goal, RecurringRule, Transaction } from "../model";
import { isTransferRule } from "../model";
import { budgetOnDate } from "./budgets";
import { requiredMonthly, type GoalLedgerFacts } from "./goals";
import { activeRows } from "./ledger";
import { monthlyPlan, type PlanAllowance, type PlanAsk } from "./plan";
import {
  firstOccurrenceOnOrAfter,
  nextOccurrence,
  upcomingOccurrences,
} from "./recurring";

function nextDay(iso: string): string {
  return format(addDays(new Date(`${iso}T00:00:00`), 1), "yyyy-MM-dd");
}

function previousDay(iso: string): string {
  return format(addDays(new Date(`${iso}T00:00:00`), -1), "yyyy-MM-dd");
}

function monthBounds(yearMonth: string): {
  start: string;
  end: string;
  days: number;
} {
  const [year, month] = yearMonth.split("-").map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${yearMonth}-01`,
    end: `${yearMonth}-${String(days).padStart(2, "0")}`,
    days,
  };
}

export interface MonthAllocationPlan {
  mode: "month";
  yearMonth: string;
  expectedIncome: number;
  incomeFromRules: boolean;
  received: number;
  stillScheduled: number;
  allowances: PlanAllowance[];
  totalAllowances: number;
  goalAsks: PlanAsk[];
  totalGoalAsks: number;
  planned: number;
  unplanned: number;
  overPlanned: boolean;
}

interface AllocationInputs {
  today: string;
  txns: Transaction[];
  categories: Category[];
  goals: Goal[];
  budgetTargets: BudgetTarget[];
  rules: RecurringRule[];
  goalFacts?: ReadonlyMap<string, GoalLedgerFacts>;
}

/** Current-month allocation, delegating the locked plan identity to monthlyPlan. */
export function allocationPlanMonth(
  input: AllocationInputs & { manualIncome: number },
): MonthAllocationPlan {
  const yearMonth = input.today.slice(0, 7);
  const plan = monthlyPlan({
    yearMonth,
    today: input.today,
    txns: input.txns,
    categories: input.categories,
    goals: input.goals,
    budgetTargets: input.budgetTargets,
    rules: input.rules,
    manualIncome: input.manualIncome,
    goalFacts: input.goalFacts,
  });
  const incomeIds = new Set(
    input.categories
      .filter((category) => category.type === "income")
      .map((category) => category.id),
  );
  const start = monthBounds(yearMonth).start;
  const actualIncome = activeRows(input.txns)
    .filter(
      (row) =>
        row.date >= start &&
        row.date <= input.today &&
        row.category_id !== null &&
        incomeIds.has(row.category_id),
    )
    .reduce((sum, row) => sum + row.amount, 0);
  const received = Math.min(Math.max(0, plan.income), Math.max(0, actualIncome));

  return {
    mode: "month",
    yearMonth,
    expectedIncome: plan.income,
    incomeFromRules: plan.incomeFromRules,
    received,
    stillScheduled: plan.income - received,
    allowances: plan.allowances,
    totalAllowances: plan.totalAllowances,
    goalAsks: plan.asks,
    totalGoalAsks: plan.totalAsks,
    planned: plan.totalAllowances + plan.totalAsks,
    unplanned: plan.unallocated,
    overPlanned: plan.overAllocated,
  };
}

export interface PayCycleScheduledExpense {
  id: string;
  ruleId: string;
  date: string;
  label: string;
  amount: number;
}

export interface PayCycleAllocationPlan {
  mode: "pay-cycle";
  start: string;
  end: string;
  anchorRuleIds: string[];
  nextIncome: {
    date: string;
    daysAway: number;
    amount: number;
    label: string;
  };
  income: number;
  allowanceShare: number;
  scheduledExpenses: PayCycleScheduledExpense[];
  totalScheduledExpenses: number;
  flexibleBudgetShare: number;
  goalAskShare: number;
  planned: number;
  unplanned: number;
  overPlanned: boolean;
}

function incomeRuleIds(rules: RecurringRule[], categories: Category[]): Set<string> {
  const incomeCategories = new Set(
    categories
      .filter((category) => category.type === "income")
      .map((category) => category.id),
  );
  return new Set(
    rules
      .filter(
        (rule) =>
          rule.status === "active" &&
          !isTransferRule(rule) &&
          rule.template_category_id !== null &&
          incomeCategories.has(rule.template_category_id) &&
          (rule.template_amount ?? 0) > 0,
      )
      .map((rule) => rule.id),
  );
}

function nextRuleDate(rule: RecurringRule, today: string): string | null {
  if (rule.status !== "active") return null;
  const from = nextDay(today) > rule.start_date ? nextDay(today) : rule.start_date;
  const date = firstOccurrenceOnOrAfter(rule, from);
  return rule.end_date !== null && date > rule.end_date ? null : date;
}

function previousRuleDate(rule: RecurringRule, today: string): string | null {
  if (rule.status !== "active" || rule.start_date > today) return null;
  let date = firstOccurrenceOnOrAfter(rule, rule.start_date);
  let previous: string | null = null;
  for (let guard = 0; date <= today && guard < 100_000; guard += 1) {
    if (rule.end_date !== null && date > rule.end_date) break;
    previous = date;
    date = nextOccurrence(rule, date);
  }
  return previous;
}

function coveredSegments(from: string, to: string) {
  const segments: { yearMonth: string; days: number; monthDays: number; end: string }[] =
    [];
  let cursor = from;
  while (cursor <= to) {
    const yearMonth = cursor.slice(0, 7);
    const bounds = monthBounds(yearMonth);
    const end = bounds.end < to ? bounds.end : to;
    segments.push({
      yearMonth,
      days:
        differenceInCalendarDays(
          new Date(`${end}T00:00:00`),
          new Date(`${cursor}T00:00:00`),
        ) + 1,
      monthDays: bounds.days,
      end: bounds.end,
    });
    cursor = nextDay(end);
  }
  return segments;
}

/** Plan claims from today until immediately before the next selected income anchor. */
export function allocationPlanPayCycle(
  input: AllocationInputs & { anchorRuleIds?: string[] },
): PayCycleAllocationPlan | null {
  const eligibleIncomeIds = incomeRuleIds(input.rules, input.categories);
  const selectedIds = new Set(
    input.anchorRuleIds === undefined
      ? eligibleIncomeIds
      : input.anchorRuleIds.filter((id) => eligibleIncomeIds.has(id)),
  );
  const anchors = input.rules.filter((rule) => selectedIds.has(rule.id));
  const nextDates = anchors.flatMap((rule) => {
    const date = nextRuleDate(rule, input.today);
    return date ? [{ rule, date }] : [];
  });
  if (nextDates.length === 0) return null;
  nextDates.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.rule.template_vendor_source.localeCompare(b.rule.template_vendor_source) ||
      a.rule.id.localeCompare(b.rule.id),
  );
  const nextDate = nextDates[0].date;
  const nextAtBoundary = nextDates.filter(({ date }) => date === nextDate);
  const previousDates = anchors.flatMap((rule) => {
    const date = previousRuleDate(rule, input.today);
    return date ? [date] : [];
  });
  const start = previousDates.sort().at(-1) ?? input.today;
  const end = previousDay(nextDate);

  const allIncomeRules = input.rules.filter((rule) => eligibleIncomeIds.has(rule.id));
  const income = upcomingOccurrences(allIncomeRules, start, end, {
    limit: Number.MAX_SAFE_INTEGER,
  }).reduce((sum, occurrence) => sum + (occurrence.amount ?? 0), 0);

  const expenseCategories = new Set(
    input.categories
      .filter((category) => category.type === "expense")
      .map((category) => category.id),
  );
  const expenseRules = input.rules.filter(
    (rule) =>
      rule.status === "active" &&
      !isTransferRule(rule) &&
      rule.template_category_id !== null &&
      expenseCategories.has(rule.template_category_id),
  );
  const scheduledExpenses = upcomingOccurrences(expenseRules, input.today, end, {
    limit: Number.MAX_SAFE_INTEGER,
  }).flatMap((occurrence): PayCycleScheduledExpense[] =>
    occurrence.amount === null || occurrence.amount >= 0
      ? []
      : [
          {
            id: `${occurrence.rule.id}:${occurrence.date}`,
            ruleId: occurrence.rule.id,
            date: occurrence.date,
            label: occurrence.rule.template_vendor_source,
            amount: -occurrence.amount,
          },
        ],
  );
  const totalScheduledExpenses = scheduledExpenses.reduce(
    (sum, expense) => sum + expense.amount,
    0,
  );

  const activeExpenseCategories = input.categories.filter(
    (category) => category.type === "expense" && !category.is_archived,
  );
  const monthlyGoalAsk = input.goals
    .filter((goal) => goal.status === "active" && !goal.is_archived)
    .reduce(
      (sum, goal) =>
        sum +
        requiredMonthly(
          goal,
          input.goalFacts?.get(goal.id) ?? input.txns,
          input.today,
        ),
      0,
    );
  let allowanceShare = 0;
  let goalAskShare = 0;
  for (const segment of coveredSegments(input.today, end)) {
    for (const category of activeExpenseCategories) {
      const budget = budgetOnDate(input.budgetTargets, category.id, segment.end);
      if (budget !== null) {
        allowanceShare += Math.round((budget * segment.days) / segment.monthDays);
      }
    }
    goalAskShare += Math.round((monthlyGoalAsk * segment.days) / segment.monthDays);
  }
  const flexibleBudgetShare = Math.max(0, allowanceShare - totalScheduledExpenses);
  const planned = totalScheduledExpenses + flexibleBudgetShare + goalAskShare;
  const unplanned = income - planned;

  return {
    mode: "pay-cycle",
    start,
    end,
    anchorRuleIds: [...selectedIds].sort(),
    nextIncome: {
      date: nextDate,
      daysAway: differenceInCalendarDays(
        new Date(`${nextDate}T00:00:00`),
        new Date(`${input.today}T00:00:00`),
      ),
      amount: nextAtBoundary.reduce(
        (sum, occurrence) => sum + (occurrence.rule.template_amount ?? 0),
        0,
      ),
      label:
        nextAtBoundary.length === 1
          ? nextAtBoundary[0].rule.template_vendor_source
          : `${nextAtBoundary.length} income events`,
    },
    income,
    allowanceShare,
    scheduledExpenses,
    totalScheduledExpenses,
    flexibleBudgetShare,
    goalAskShare,
    planned,
    unplanned,
    overPlanned: unplanned < 0,
  };
}
