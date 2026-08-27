import { addDays, format } from "date-fns";
import {
  recurringOccurrenceDate,
  type Category,
  type Container,
  type RecurringRule,
  type Transaction,
} from "../model";
import { isLiveLedgerRow } from "./balances";
import { activeRows, pendingRows } from "./ledger";
import { upcomingOccurrences } from "./recurring";

export type CashHorizonDays = 14 | 30 | 60;
export type CashHorizonEventKind = "income" | "expense" | "transfer";
export type CashHorizonEventSource = "recurring" | "pending" | "approved-future";

export interface CashHorizonEvent {
  id: string;
  date: string;
  label: string;
  amount: number;
  balanceAfter: number;
  kind: CashHorizonEventKind;
  source: CashHorizonEventSource;
  ruleId: string | null;
  transactionId: string | null;
}

export interface CashHorizonUnknownEvent {
  ruleId: string;
  date: string;
  label: string;
}

export interface CashHorizon {
  start: string;
  end: string;
  days: CashHorizonDays;
  containerIds: string[];
  startingBalance: number;
  projectedBalance: number;
  low: { balance: number; date: string };
  firstBelowZero: { balance: number; date: string } | null;
  largestShortfall: number;
  nextIncome: CashHorizonEvent | null;
  billsBeforeNextIncome: { count: number; amount: number };
  events: CashHorizonEvent[];
  unknownEvents: CashHorizonUnknownEvent[];
}

interface EventDraft extends Omit<CashHorizonEvent, "balanceAfter"> {}

function linkedKey(ruleId: string, date: string): string {
  return `${ruleId}:${date}`;
}

function selectedCashContainers(
  containers: Container[],
  requestedIds?: readonly string[],
): Container[] {
  if (requestedIds) {
    const requested = new Set(requestedIds);
    return containers.filter(
      (container) => requested.has(container.id) && !container.is_archived,
    );
  }
  return containers.filter(
    (container) =>
      container.include_in_overall_balance &&
      !container.is_archived &&
      !container.is_investment,
  );
}

function transactionDelta(row: Transaction, included: Set<string>): number {
  let delta = 0;
  if (included.has(row.container_id)) delta += row.amount;
  if (row.to_container_id && included.has(row.to_container_id)) delta -= row.amount;
  return delta;
}

function selectedBalanceAsOf(
  transactions: Transaction[],
  included: Set<string>,
  today: string,
): number {
  return transactions.reduce(
    (sum, row) =>
      !isLiveLedgerRow(row) || row.date > today
        ? sum
        : sum + transactionDelta(row, included),
    0,
  );
}

function ruleDelta(rule: RecurringRule, amount: number, included: Set<string>): number {
  if (rule.template_to_container_id) {
    const magnitude = Math.abs(amount);
    let delta = 0;
    if (included.has(rule.template_container_id)) delta -= magnitude;
    if (included.has(rule.template_to_container_id)) delta += magnitude;
    return delta;
  }
  return included.has(rule.template_container_id) ? amount : 0;
}

function touchesIncluded(
  sourceId: string,
  destinationId: string | null,
  included: Set<string>,
): boolean {
  return (
    included.has(sourceId) || (destinationId !== null && included.has(destinationId))
  );
}

function eventKind(
  categoryId: string | null,
  destinationId: string | null,
  categoryTypes: Map<string, Category["type"]>,
): CashHorizonEventKind {
  if (destinationId !== null) return "transfer";
  return categoryId !== null && categoryTypes.get(categoryId) === "income"
    ? "income"
    : "expense";
}

function transactionDraft(
  row: Transaction,
  source: Exclude<CashHorizonEventSource, "recurring">,
  included: Set<string>,
  categoryTypes: Map<string, Category["type"]>,
): EventDraft | null {
  if (!touchesIncluded(row.container_id, row.to_container_id, included)) return null;
  return {
    id: row.id,
    date: row.date,
    label: row.vendor_source,
    amount: transactionDelta(row, included),
    kind: eventKind(row.category_id, row.to_container_id, categoryTypes),
    source,
    ruleId: row.recurring_rule_id,
    transactionId: row.id,
  };
}

/** Raw-cash forecast from today through one approved 14/30/60-day window. */
export function cashHorizon(
  transactions: Transaction[],
  categories: Category[],
  containers: Container[],
  recurringRules: RecurringRule[],
  today: string,
  days: CashHorizonDays,
  requestedContainerIds?: readonly string[],
  balancesAsOfToday?: ReadonlyMap<string, number>,
): CashHorizon {
  const cashContainers = selectedCashContainers(containers, requestedContainerIds);
  const containerIds = cashContainers.map((container) => container.id).sort();
  const included = new Set(containerIds);
  const categoryTypes = new Map(
    categories.map((category) => [category.id, category.type]),
  );
  const end = format(addDays(new Date(`${today}T00:00:00`), days), "yyyy-MM-dd");
  const startingBalance = balancesAsOfToday
    ? containerIds.reduce(
        (sum, containerId) => sum + (balancesAsOfToday.get(containerId) ?? 0),
        0,
      )
    : selectedBalanceAsOf(transactions, included, today);
  const drafts: EventDraft[] = [];

  const approvedActive = activeRows(transactions).filter(
    (row) =>
      row.recurring_rule_id !== null &&
      recurringOccurrenceDate(row) >= today &&
      recurringOccurrenceDate(row) <= end,
  );
  const pending = pendingRows(transactions).filter(
    (row) => recurringOccurrenceDate(row) >= today && recurringOccurrenceDate(row) <= end,
  );
  const approvedLinkedKeys = new Set(
    approvedActive.map((row) =>
      linkedKey(row.recurring_rule_id!, recurringOccurrenceDate(row)),
    ),
  );
  const represented = new Set(approvedLinkedKeys);

  for (const row of transactions) {
    if (!isLiveLedgerRow(row) || row.date <= today || row.date > end) {
      continue;
    }
    const draft = transactionDraft(row, "approved-future", included, categoryTypes);
    if (draft) drafts.push(draft);
  }

  for (const row of pending) {
    if (row.recurring_rule_id) {
      const key = linkedKey(row.recurring_rule_id, recurringOccurrenceDate(row));
      represented.add(key);
      if (approvedLinkedKeys.has(key)) continue;
    } else if (row.to_container_id === null) {
      continue;
    }
    const draft = transactionDraft(row, "pending", included, categoryTypes);
    if (draft) drafts.push(draft);
  }

  const unknownEvents: CashHorizonUnknownEvent[] = [];
  for (const occurrence of upcomingOccurrences(recurringRules, today, end, {
    limit: Number.MAX_SAFE_INTEGER,
  })) {
    const rule = occurrence.rule;
    if (represented.has(linkedKey(rule.id, occurrence.date))) continue;
    if (
      !touchesIncluded(
        rule.template_container_id,
        rule.template_to_container_id,
        included,
      )
    ) {
      continue;
    }
    if (occurrence.amount === null) {
      unknownEvents.push({
        ruleId: rule.id,
        date: occurrence.date,
        label: rule.template_vendor_source,
      });
      continue;
    }
    drafts.push({
      id: `${rule.id}:${occurrence.date}`,
      date: occurrence.date,
      label: rule.template_vendor_source,
      amount: ruleDelta(rule, occurrence.amount, included),
      kind: eventKind(
        rule.template_category_id,
        rule.template_to_container_id,
        categoryTypes,
      ),
      source: "recurring",
      ruleId: rule.id,
      transactionId: null,
    });
  }

  drafts.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.label.localeCompare(b.label) ||
      a.id.localeCompare(b.id),
  );
  unknownEvents.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.label.localeCompare(b.label) ||
      a.ruleId.localeCompare(b.ruleId),
  );

  let balance = startingBalance;
  let low = { balance, date: today };
  let firstBelowZero = balance < 0 ? { balance, date: today } : null;
  const events = drafts.map((draft): CashHorizonEvent => {
    balance += draft.amount;
    if (balance < low.balance) low = { balance, date: draft.date };
    if (firstBelowZero === null && balance < 0) {
      firstBelowZero = { balance, date: draft.date };
    }
    return { ...draft, balanceAfter: balance };
  });
  const nextIncome =
    events.find((event) => event.kind === "income" && event.amount > 0) ?? null;
  const bills = nextIncome
    ? events.filter(
        (event) =>
          event.kind === "expense" && event.amount < 0 && event.date < nextIncome.date,
      )
    : [];

  return {
    start: today,
    end,
    days,
    containerIds,
    startingBalance,
    projectedBalance: balance,
    low,
    firstBelowZero,
    largestShortfall: Math.max(0, -low.balance),
    nextIncome,
    billsBeforeNextIncome: {
      count: bills.length,
      amount: bills.reduce((sum, event) => sum + event.amount, 0),
    },
    events,
    unknownEvents,
  };
}
