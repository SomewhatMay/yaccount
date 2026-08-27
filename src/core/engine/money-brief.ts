import { differenceInCalendarDays } from "date-fns";
import type { Container, ContainerSnapshot, RecurringRule, Transaction } from "../model";
import { pendingRows } from "./ledger";
import type { BudgetTriage, BudgetTriageRow } from "./budget-triage";
import type { CashHorizon, CashHorizonEvent } from "./cash-horizon";

export type MoneyBriefActionScreen =
  "categories" | "containers" | "inbox" | "ledger" | "recurring";

export interface MoneyBriefAction {
  screen: MoneyBriefActionScreen;
  focusId: string | null;
}

export interface MoneyBriefCashRiskItem {
  kind: "cash-risk";
  date: string;
  balance: number;
  shortfall: number;
  action: MoneyBriefAction;
}

export interface MoneyBriefPendingItem {
  kind: "pending";
  count: number;
  action: MoneyBriefAction;
}

export interface MoneyBriefBudgetItem {
  kind: "budget";
  categoryId: string;
  name: string;
  status: Extract<BudgetTriageRow["status"], "spent" | "projected">;
  budget: number;
  spent: number;
  projected: number;
  remaining: number;
  action: MoneyBriefAction;
}

export interface MoneyBriefStaleValuesItem {
  kind: "stale-values";
  staleCount: number;
  missingCount: number;
  oldestAgeDays: number | null;
  action: MoneyBriefAction;
}

export type MoneyBriefItem =
  | MoneyBriefCashRiskItem
  | MoneyBriefPendingItem
  | MoneyBriefBudgetItem
  | MoneyBriefStaleValuesItem;

export interface MoneyBrief {
  items: MoneyBriefItem[];
  totalItems: number;
  hiddenItemCount: number;
  nextKnownBill: { date: string; label: string; amount: number } | null;
  hasScheduledContext: boolean;
}

function cashAction(event: CashHorizonEvent | null): MoneyBriefAction {
  if (!event) return { screen: "ledger", focusId: null };
  if (event.source === "pending") {
    return { screen: "inbox", focusId: event.transactionId };
  }
  if (event.source === "recurring") {
    return { screen: "recurring", focusId: event.ruleId };
  }
  return { screen: "ledger", focusId: event.transactionId };
}

function latestSnapshots(
  snapshots: readonly ContainerSnapshot[],
): Map<string, ContainerSnapshot> {
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
  return latest;
}

function staleValuesItem(
  today: string,
  containers: readonly Container[],
  snapshots: readonly ContainerSnapshot[],
): MoneyBriefStaleValuesItem | null {
  const latest = latestSnapshots(snapshots);
  const affected: Container[] = [];
  const ages: number[] = [];
  let missingCount = 0;
  for (const container of containers) {
    if (!container.is_investment || container.is_archived) continue;
    const snapshot = latest.get(container.id);
    if (!snapshot) {
      affected.push(container);
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
    if (age <= 30) continue;
    affected.push(container);
    ages.push(age);
  }
  if (affected.length === 0) return null;
  return {
    kind: "stale-values",
    staleCount: ages.length,
    missingCount,
    oldestAgeDays: ages.length === 0 ? null : Math.max(...ages),
    action: {
      screen: "containers",
      focusId: affected.length === 1 ? affected[0].id : null,
    },
  };
}

function budgetItem(row: BudgetTriageRow): MoneyBriefBudgetItem | null {
  if (row.status !== "spent" && row.status !== "projected") return null;
  return {
    kind: "budget",
    categoryId: row.categoryId,
    name: row.name,
    status: row.status,
    budget: row.budget,
    spent: row.spent,
    projected: row.projected,
    remaining: row.remaining,
    action: { screen: "categories", focusId: row.categoryId },
  };
}

/** Ranked current matters; month-close truth is intentionally outside this slice. */
export function moneyBrief(input: {
  today: string;
  ledgerTransactions: Transaction[];
  containers: Container[];
  snapshots: ContainerSnapshot[];
  recurringRules: RecurringRule[];
  budgetTriage: BudgetTriage;
  cashHorizon: CashHorizon;
}): MoneyBrief {
  const candidates: MoneyBriefItem[] = [];
  if (input.cashHorizon.firstBelowZero) {
    const crossingEvent =
      input.cashHorizon.events.find((event) => event.balanceAfter < 0) ?? null;
    candidates.push({
      kind: "cash-risk",
      date: input.cashHorizon.firstBelowZero.date,
      balance: input.cashHorizon.firstBelowZero.balance,
      shortfall: input.cashHorizon.largestShortfall,
      action: cashAction(crossingEvent),
    });
  }

  const pendingCount = pendingRows(input.ledgerTransactions).length;
  if (pendingCount > 0) {
    candidates.push({
      kind: "pending",
      count: pendingCount,
      action: { screen: "inbox", focusId: null },
    });
  }

  for (const row of input.budgetTriage.rows) {
    const item = budgetItem(row);
    if (item) candidates.push(item);
  }

  const stale = staleValuesItem(input.today, input.containers, input.snapshots);
  if (stale) candidates.push(stale);

  const items = candidates.slice(0, 3);
  const nextKnownBill = input.cashHorizon.events.find(
    (event) => event.kind === "expense" && event.amount < 0,
  );
  return {
    items,
    totalItems: candidates.length,
    hiddenItemCount: candidates.length - items.length,
    nextKnownBill: nextKnownBill
      ? {
          date: nextKnownBill.date,
          label: nextKnownBill.label,
          amount: nextKnownBill.amount,
        }
      : null,
    hasScheduledContext:
      input.recurringRules.some((rule) => rule.status === "active") ||
      input.cashHorizon.events.length > 0 ||
      input.cashHorizon.unknownEvents.length > 0,
  };
}
