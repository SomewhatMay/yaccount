import { isLiveLedgerRow, isTransfer } from "@/core/engine/balances";
import { activeRows, pendingRows, templateRows } from "@/core/engine/ledger";
import type { Transaction } from "@/core/model";

export const LEDGER_READ_MODEL_VERSION = 1;
export const LEDGER_READ_REVISION_KEY = "ledgerRead:revision";
export const LEDGER_READ_VERSION_KEY = "ledgerRead:version";

export type LedgerReadState = "ledger" | "pending" | "template";
export type LedgerReadSort = "newest" | "oldest" | "largest" | "smallest";

export type EntryRead = Transaction & {
  state: LedgerReadState;
  normalizedVendor: string;
  normalizedNotes: string;
  chronologyKey: IDBValidKey;
  largestKey: IDBValidKey;
  smallestKey: IDBValidKey;
  categoryChronologyKey: IDBValidKey | null;
  sourceChronologyKey: IDBValidKey;
  destinationChronologyKey: IDBValidKey | null;
  ruleChronologyKey: IDBValidKey | null;
  occurrenceChronologyKey: IDBValidKey | null;
  cravingChronologyKey: IDBValidKey | null;
  vendorUsageKey: IDBValidKey | null;
  shortcutUsageKey: IDBValidKey;
};

export interface LedgerBalanceBucket {
  id: string;
  period: "day" | "month";
  containerId: string;
  key: string;
  balanceDelta: number;
  transferInflow: number;
  transferOutflow: number;
  netContribution: number;
  ordinaryIn: number;
  ordinaryOut: number;
  ordinaryCount: number;
}

export interface LedgerContainerFact {
  id: string;
  containerId: string;
  balance: number;
  netContribution: number;
}

export interface LedgerUsageFact {
  id: string;
  kind: "category" | "container" | "vendor" | "shortcut";
  subject: string;
  count: number;
  recent: string;
  recentId: string;
  value?: string;
  categoryId?: string;
  containerId?: string;
  shape?: string;
}

export interface LedgerUsageContribution {
  id: string;
  kind: LedgerUsageFact["kind"];
  subject: string;
  selector: "category" | "container" | "vendor" | "shortcut";
  value?: string;
  categoryId?: string;
  containerId?: string;
  shape?: string;
}

export interface LedgerReadModel {
  entries: EntryRead[];
  buckets: LedgerBalanceBucket[];
  facts: Map<string, LedgerContainerFact>;
  usage: LedgerUsageFact[];
  counts: Record<LedgerReadState, number>;
}

/** IndexedDB-order key that reverses every UTF-16 string, including prefixes. */
export function reverseStringKey(value: string): number[] {
  const key: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    key.push(-value.charCodeAt(index));
  }
  key.push(65_536);
  return key;
}

function chronology(row: Transaction, state: LedgerReadState): IDBValidKey {
  return [state, row.date, row.entered_at ?? "", row.id];
}

export function ledgerShortcutShape(row: Transaction, template = false): string {
  return JSON.stringify([
    template && row.to_container_id ? -Math.abs(row.amount) : row.amount,
    row.vendor_source,
    row.category_id,
    row.container_id,
    row.to_container_id,
    row.notes,
  ]);
}

export function ledgerUsageRecent(row: Transaction): string {
  return row.entered_at ?? `${row.date}T00:00:00.000Z`;
}

export function ledgerUsageContributions(
  row: Transaction,
): LedgerUsageContribution[] {
  const contributions: LedgerUsageContribution[] = [];
  if (row.category_id) {
    contributions.push({
      id: `usage:category:${row.category_id}`,
      kind: "category",
      subject: row.category_id,
      selector: "category",
      categoryId: row.category_id,
    });
  }
  for (const containerId of new Set(
    [row.container_id, row.to_container_id].filter(
      (id): id is string => id !== null,
    ),
  )) {
    contributions.push({
      id: `usage:container:${containerId}`,
      kind: "container",
      subject: containerId,
      selector: "container",
      containerId,
    });
  }
  if (row.to_container_id === null && row.category_id !== null) {
    const value = row.vendor_source.trim().normalize("NFC");
    const subject = value.toLocaleLowerCase();
    contributions.push({
      id: `usage:vendor:${JSON.stringify([subject, row.category_id, row.container_id])}`,
      kind: "vendor",
      subject,
      selector: "vendor",
      value,
      categoryId: row.category_id,
      containerId: row.container_id,
    });
  }
  const shape = ledgerShortcutShape(row);
  contributions.push({
    id: `usage:shortcut:${shape}`,
    kind: "shortcut",
    subject: shape,
    selector: "shortcut",
    shape,
  });
  return contributions;
}

function projection(row: Transaction, state: LedgerReadState): EntryRead {
  const instant = row.entered_at ?? "";
  const chronologyKey = chronology(row, state);
  return {
    ...row,
    state,
    normalizedVendor: row.vendor_source
      .normalize("NFC")
      .trim()
      .replace(/\s+/gu, " ")
      .toLocaleLowerCase(),
    normalizedNotes: (row.notes ?? "").normalize("NFC").toLocaleLowerCase(),
    chronologyKey,
    largestKey: [state, Math.abs(row.amount), row.date, instant, row.id],
    smallestKey: [
      state,
      Math.abs(row.amount),
      reverseStringKey(row.date),
      reverseStringKey(instant),
      reverseStringKey(row.id),
    ],
    categoryChronologyKey:
      row.category_id === null ? null : [state, row.category_id, row.date, instant, row.id],
    sourceChronologyKey: [state, row.container_id, row.date, instant, row.id],
    destinationChronologyKey:
      row.to_container_id === null
        ? null
        : [state, row.to_container_id, row.date, instant, row.id],
    ruleChronologyKey:
      row.recurring_rule_id === null
        ? null
        : [state, row.recurring_rule_id, row.date, instant, row.id],
    occurrenceChronologyKey:
      row.recurring_rule_id === null
        ? null
        : [
            state,
            row.recurring_rule_id,
            row.recurring_occurrence_date ?? row.date,
            row.id,
          ],
    cravingChronologyKey: null,
    vendorUsageKey:
      row.to_container_id === null && row.category_id !== null
        ? [
            state,
            row.vendor_source
              .normalize("NFC")
              .trim()
              .replace(/\s+/gu, " ")
              .toLocaleLowerCase(),
            row.category_id,
            row.container_id,
            row.date,
            instant,
            row.id,
          ]
        : null,
    shortcutUsageKey: [
      state,
      ledgerShortcutShape(row),
      row.date,
      instant,
      row.id,
    ],
  };
}

export function entryIndexKey(entry: EntryRead, sort: LedgerReadSort): IDBValidKey {
  if (sort === "largest") return entry.largestKey;
  if (sort === "smallest") return entry.smallestKey;
  return entry.chronologyKey;
}

function addBucket(
  buckets: Map<string, LedgerBalanceBucket>,
  period: LedgerBalanceBucket["period"],
  key: string,
  containerId: string,
  values: Pick<
    LedgerBalanceBucket,
    "balanceDelta" | "transferInflow" | "transferOutflow" | "netContribution"
    | "ordinaryIn"
    | "ordinaryOut"
    | "ordinaryCount"
  >,
): void {
  const id = `${period}:${key}:${containerId}`;
  const existing = buckets.get(id) ?? {
    id,
    period,
    key,
    containerId,
    balanceDelta: 0,
    transferInflow: 0,
    transferOutflow: 0,
    netContribution: 0,
    ordinaryIn: 0,
    ordinaryOut: 0,
    ordinaryCount: 0,
  };
  existing.balanceDelta += values.balanceDelta;
  existing.transferInflow += values.transferInflow;
  existing.transferOutflow += values.transferOutflow;
  existing.netContribution += values.netContribution;
  existing.ordinaryIn += values.ordinaryIn;
  existing.ordinaryOut += values.ordinaryOut;
  existing.ordinaryCount += values.ordinaryCount;
  buckets.set(id, existing);
}

function addFact(
  facts: Map<string, LedgerContainerFact>,
  containerId: string,
  balance: number,
  contribution: number,
): void {
  const existing = facts.get(containerId) ?? {
    id: `container:${containerId}`,
    containerId,
    balance: 0,
    netContribution: 0,
  };
  existing.balance += balance;
  existing.netContribution += contribution;
  facts.set(containerId, existing);
}

export function deriveLedgerReadModel(transactions: Transaction[]): LedgerReadModel {
  const ledger = activeRows(transactions).map((row) => projection(row, "ledger"));
  const pending = pendingRows(transactions).map((row) => projection(row, "pending"));
  const templates = templateRows(transactions).map((row) => projection(row, "template"));
  const buckets = new Map<string, LedgerBalanceBucket>();
  const facts = new Map<string, LedgerContainerFact>();
  const usage = new Map<string, LedgerUsageFact>();

  for (const entry of ledger) {
    const recent = ledgerUsageRecent(entry);
    for (const contribution of ledgerUsageContributions(entry)) {
      const current = usage.get(contribution.id);
      const newest =
        !current ||
        recent > current.recent ||
        (recent === current.recent && entry.id > current.recentId);
      usage.set(contribution.id, {
        ...contribution,
        count: (current?.count ?? 0) + 1,
        recent: newest ? recent : current.recent,
        recentId: newest ? entry.id : current.recentId,
        ...(contribution.kind === "vendor"
          ? { value: newest ? contribution.value : current.value }
          : {}),
      });
    }
  }

  for (const row of transactions) {
    if (!isLiveLedgerRow(row)) continue;
    const transfer = isTransfer(row);
    const source = {
      balanceDelta: row.amount,
      transferInflow: 0,
      transferOutflow: transfer ? -row.amount : 0,
      netContribution: transfer ? row.amount : 0,
      ordinaryIn: !transfer && row.amount >= 0 ? row.amount : 0,
      ordinaryOut: !transfer && row.amount < 0 ? -row.amount : 0,
      ordinaryCount: transfer ? 0 : 1,
    };
    const destination = row.to_container_id
      ? {
          balanceDelta: -row.amount,
          transferInflow: transfer ? -row.amount : 0,
          transferOutflow: 0,
          netContribution: transfer ? -row.amount : 0,
          ordinaryIn: 0,
          ordinaryOut: 0,
          ordinaryCount: 0,
        }
      : null;

    for (const [period, key] of [
      ["day", row.date],
      ["month", row.yearMonth],
    ] as const) {
      addBucket(buckets, period, key, row.container_id, source);
      if (destination && row.to_container_id) {
        addBucket(buckets, period, key, row.to_container_id, destination);
      }
    }
    addFact(facts, row.container_id, source.balanceDelta, source.netContribution);
    if (destination && row.to_container_id) {
      addFact(
        facts,
        row.to_container_id,
        destination.balanceDelta,
        destination.netContribution,
      );
    }
  }

  return {
    entries: [...ledger, ...pending, ...templates],
    buckets: [...buckets.values()],
    facts,
    usage: [...usage.values()],
    counts: {
      ledger: ledger.length,
      pending: pending.length,
      template: templates.length,
    },
  };
}
