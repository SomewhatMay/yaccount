import { addDays, format } from "date-fns";
import type { BudgetTarget, Category, RecurringRule, Transaction } from "../model";
import { budgetOnDate } from "./budgets";
import { activeRows, pendingRows } from "./ledger";
import { inRange } from "./period";
import { upcomingOccurrences } from "./recurring";

export type BudgetTriageStatus = "spent" | "projected" | "watch" | "on-track";
export type BudgetScheduledSource = "recurring" | "pending" | "approved-future";

export interface BudgetScheduledItem {
  id: string;
  categoryId: string;
  ruleId: string | null;
  date: string;
  label: string;
  amount: number;
  source: BudgetScheduledSource;
}

export interface BudgetTriageRow {
  categoryId: string;
  name: string;
  budget: number;
  spent: number;
  remaining: number;
  elapsedDays: number;
  daysInMonth: number;
  monthElapsedPct: number;
  spentPct: number | null;
  linearProjection: number | null;
  scheduledRemaining: number;
  scheduled: BudgetScheduledItem[];
  projected: number;
  status: BudgetTriageStatus;
}

export interface BudgetTriage {
  yearMonth: string;
  start: string;
  end: string;
  elapsedDays: number;
  daysInMonth: number;
  rows: BudgetTriageRow[];
  counts: { needsAttention: number; watch: number; onTrack: number };
}

function monthDays(yearMonth: string): number {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function nextDay(iso: string): string {
  return format(addDays(new Date(`${iso}T00:00:00`), 1), "yyyy-MM-dd");
}

function linkedKey(ruleId: string, date: string): string {
  return `${ruleId}:${date}`;
}

function scheduledRows(
  transactions: Transaction[],
  eligibleIds: Set<string>,
  range: { start: string; end: string },
  today: string,
): { items: BudgetScheduledItem[]; represented: Set<string> } {
  const approvedFuture = activeRows(transactions).filter(
    (row) =>
      row.date > today &&
      row.category_id !== null &&
      eligibleIds.has(row.category_id) &&
      inRange(row.date, range),
  );
  const pending = pendingRows(transactions).filter(
    (row) =>
      row.recurring_rule_id !== null &&
      row.category_id !== null &&
      eligibleIds.has(row.category_id) &&
      inRange(row.date, range),
  );
  const represented = new Set<string>();
  const items = [...approvedFuture, ...pending].map((row) => {
    if (row.recurring_rule_id) {
      represented.add(linkedKey(row.recurring_rule_id, row.date));
    }
    return {
      id: row.id,
      categoryId: row.category_id!,
      ruleId: row.recurring_rule_id,
      date: row.date,
      label: row.vendor_source,
      amount: row.amount === 0 ? 0 : -row.amount,
      source: (row.inbox_status === "pending"
        ? "pending"
        : "approved-future") as BudgetScheduledSource,
    };
  });
  return { items, represented };
}

/** Current-month allowance triage with actual and known scheduled spend separated. */
export function budgetTriage(
  transactions: Transaction[],
  categories: Category[],
  budgetTargets: BudgetTarget[],
  recurringRules: RecurringRule[],
  today: string,
): BudgetTriage {
  const yearMonth = today.slice(0, 7);
  const daysInMonth = monthDays(yearMonth);
  const start = `${yearMonth}-01`;
  const end = `${yearMonth}-${String(daysInMonth).padStart(2, "0")}`;
  const elapsedDays = Number(today.slice(8));
  const range = { start, end };

  const eligible = categories.filter(
    (category) =>
      category.type === "expense" &&
      !category.is_archived &&
      !category.excluded_from_stats &&
      budgetOnDate(budgetTargets, category.id, end) !== null,
  );
  const eligibleIds = new Set(eligible.map((category) => category.id));
  const approved = activeRows(transactions);
  const actualSigned = new Map<string, number>();
  for (const row of approved) {
    if (
      row.date > today ||
      row.category_id === null ||
      !eligibleIds.has(row.category_id) ||
      !inRange(row.date, range)
    ) {
      continue;
    }
    actualSigned.set(
      row.category_id,
      (actualSigned.get(row.category_id) ?? 0) + row.amount,
    );
  }

  const byCategory = new Map<string, BudgetScheduledItem[]>();
  const represented = scheduledRows(transactions, eligibleIds, range, today);
  for (const item of represented.items) {
    const list = byCategory.get(item.categoryId) ?? [];
    list.push(item);
    byCategory.set(item.categoryId, list);
  }

  const occurrenceStart = nextDay(today);
  if (occurrenceStart <= end) {
    const expenseRules = recurringRules.filter(
      (rule) =>
        rule.template_category_id !== null &&
        eligibleIds.has(rule.template_category_id) &&
        rule.template_amount !== null,
    );
    for (const occurrence of upcomingOccurrences(expenseRules, occurrenceStart, end, {
      limit: Number.MAX_SAFE_INTEGER,
    })) {
      const categoryId = occurrence.rule.template_category_id!;
      if (represented.represented.has(linkedKey(occurrence.rule.id, occurrence.date))) {
        continue;
      }
      const list = byCategory.get(categoryId) ?? [];
      list.push({
        id: `${occurrence.rule.id}:${occurrence.date}`,
        categoryId,
        ruleId: occurrence.rule.id,
        date: occurrence.date,
        label: occurrence.rule.template_vendor_source,
        amount: occurrence.amount === 0 ? 0 : -occurrence.amount!,
        source: "recurring",
      });
      byCategory.set(categoryId, list);
    }
  }

  const rows = eligible.map((category): BudgetTriageRow => {
    const budget = budgetOnDate(budgetTargets, category.id, end)!;
    const signed = actualSigned.get(category.id) ?? 0;
    const spent = signed === 0 ? 0 : -signed;
    const scheduled = (byCategory.get(category.id) ?? []).sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.label.localeCompare(b.label) ||
        a.id.localeCompare(b.id),
    );
    const scheduledRemaining = scheduled.reduce((sum, item) => sum + item.amount, 0);
    const linearProjection =
      elapsedDays >= 7 ? Math.round((spent * daysInMonth) / elapsedDays) : null;
    const projected = Math.max(
      spent,
      spent + scheduledRemaining,
      linearProjection ?? spent,
    );
    const remaining = budget - spent;
    const status: BudgetTriageStatus =
      spent > budget
        ? "spent"
        : projected > budget
          ? "projected"
          : projected > 0 && budget > 0 && projected * 10 >= budget * 9
            ? "watch"
            : remaining < scheduledRemaining
              ? "watch"
              : "on-track";
    return {
      categoryId: category.id,
      name: category.name,
      budget,
      spent,
      remaining,
      elapsedDays,
      daysInMonth,
      monthElapsedPct: elapsedDays / daysInMonth,
      spentPct: budget === 0 ? null : spent / budget,
      linearProjection,
      scheduledRemaining,
      scheduled,
      projected,
      status,
    };
  });

  const statusRank: Record<BudgetTriageStatus, number> = {
    spent: 0,
    projected: 1,
    watch: 2,
    "on-track": 3,
  };
  rows.sort((a, b) => {
    const status = statusRank[a.status] - statusRank[b.status];
    if (status !== 0) return status;
    if (a.status === "spent") {
      const overage = b.spent - b.budget - (a.spent - a.budget);
      if (overage !== 0) return overage;
    } else if (a.status === "projected") {
      const overage = b.projected - b.budget - (a.projected - a.budget);
      if (overage !== 0) return overage;
    } else {
      const buffer = a.budget - a.projected - (b.budget - b.projected);
      if (buffer !== 0) return buffer;
    }
    return a.name.localeCompare(b.name) || a.categoryId.localeCompare(b.categoryId);
  });

  return {
    yearMonth,
    start,
    end,
    elapsedDays,
    daysInMonth,
    rows,
    counts: {
      needsAttention: rows.filter(
        (row) => row.status === "spent" || row.status === "projected",
      ).length,
      watch: rows.filter((row) => row.status === "watch").length,
      onTrack: rows.filter((row) => row.status === "on-track").length,
    },
  };
}
