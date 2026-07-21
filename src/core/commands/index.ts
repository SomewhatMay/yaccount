import {
  makeCategory,
  makeContainer,
  makeContainerSnapshot,
  makeSetting,
  makeTransaction,
  makeTransfer,
  makeVoidRow,
  newId,
  SETTING,
  type Category,
  type CategoryType,
  type Container,
  type ContainerSnapshot,
  type Transaction,
} from "../model";
import type { Op } from "../oplog";

/**
 * Commands (impl §3): pure builders that turn a UI intent into exactly one Op
 * `{ id, ts, type, payload }`. They mint the op id + timestamp (injectable via
 * `meta` for deterministic tests) and construct the row via the model factories.
 * `Repo.dispatch` then appends + applies the op atomically (§0.1). No IndexedDB,
 * no React here — pure and unit-testable (`src/core` boundary, §0.7).
 */
export interface OpMeta {
  id?: string; // op id — defaults to a fresh UUID
  ts?: string; // op timestamp — defaults to now (ISO)
}

function meta(m?: OpMeta): { id: string; ts: string } {
  return { id: m?.id ?? newId(), ts: m?.ts ?? new Date().toISOString() };
}

// ── Categories (§5.1, §5.5) ───────────────────────────────────────────────

export function createCategory(
  input: { name: string; type: CategoryType; id?: string; color?: string | null },
  m?: OpMeta,
): Op {
  return { ...meta(m), type: "category.create", payload: { row: makeCategory(input) } };
}

/** Rename / edit: the caller passes the whole edited row (entity-LWW). */
export function updateCategory(row: Category, m?: OpMeta): Op {
  return { ...meta(m), type: "category.update", payload: { row } };
}

/** Soft delete only (§5.5) — never a destructive removal. */
export function archiveCategory(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "category.archive", payload: { id } };
}

/** Put it back. Undo is first-class: nothing the user can do is one-way. */
export function unarchiveCategory(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "category.unarchive", payload: { id } };
}

// ── Transactions (§5.4) ───────────────────────────────────────────────────

export function createTransaction(
  input: {
    date: string;
    amount: number; // signed cents
    vendor_source: string;
    category_id: string;
    id?: string;
    container_id?: string;
    notes?: string | null;
  },
  m?: OpMeta,
): Op {
  return {
    ...meta(m),
    type: "transaction.create",
    payload: { row: makeTransaction(input) },
  };
}

/** Edit: the caller passes the whole edited row (entity-LWW). */
export function updateTransaction(row: Transaction, m?: OpMeta): Op {
  return { ...meta(m), type: "transaction.update", payload: { row } };
}

/**
 * "Delete" = void (§0.3): append a reversing row linked to `original` via
 * `reverses_id`; the original is never touched. `voidId` sets the reversing
 * row's own id; `on` optionally re-dates it.
 */
export function voidTransaction(
  original: Transaction,
  m?: OpMeta & { voidId?: string; on?: string },
): Op {
  const row = makeVoidRow(original, { id: m?.voidId, on: m?.on });
  return { ...meta(m), type: "transaction.void", payload: { row } };
}

/**
 * Undo a delete: append a row reversing the *reversing* row, which nets the void
 * back out and makes the original live again (`activeRows`). Nothing is ever
 * rewritten — the journal keeps delete and undelete as two visible events, so a
 * ledger reads like a git history rather than a series of disappearances.
 */
export function unvoidTransaction(
  voidRow: Transaction,
  m?: OpMeta & { voidId?: string; on?: string },
): Op {
  const row = makeVoidRow(voidRow, { id: m?.voidId, on: m?.on });
  return { ...meta(m), type: "transaction.void", payload: { row } };
}

// ── Containers (§5.2, §5.5) ───────────────────────────────────────────────

/** New container. `include_in_overall_balance` defaults FALSE (opt-in, §5.7). */
export function createContainer(
  input: {
    name: string;
    id?: string;
    is_investment?: boolean;
    include_in_overall_balance?: boolean;
  },
  m?: OpMeta,
): Op {
  return { ...meta(m), type: "container.create", payload: { row: makeContainer(input) } };
}

/** Rename / flip a flag: the caller passes the whole edited row (entity-LWW). */
export function updateContainer(row: Container, m?: OpMeta): Op {
  return { ...meta(m), type: "container.update", payload: { row } };
}

/** Soft delete only (§5.5) — an archived container stays a valid FK target. */
export function archiveContainer(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "container.archive", payload: { id } };
}

/** Put it back (see `unarchiveCategory`). */
export function unarchiveContainer(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "container.unarchive", payload: { id } };
}

// ── Transfers (§5.4) ──────────────────────────────────────────────────────

/**
 * Move money between two owned containers: ONE negative row on the source, no
 * category. It is an ordinary `transaction.create` — the shape is in the row's
 * fields, not in a separate op type.
 */
export function createTransfer(
  input: {
    date: string;
    amount: number; // positive magnitude in cents
    container_id: string;
    to_container_id: string;
    fromName?: string;
    toName?: string;
    vendor_source?: string;
    id?: string;
    notes?: string | null;
  },
  m?: OpMeta,
): Op {
  return {
    ...meta(m),
    type: "transaction.create",
    payload: { row: makeTransfer(input) },
  };
}

// ── Container snapshots (§5.6) ────────────────────────────────────────────

/** Log a container's real-world reported value; snapshots accumulate. */
export function recordSnapshot(
  input: {
    container_id: string;
    date: string;
    reported_balance: number; // integer cents
    id?: string;
  },
  m?: OpMeta,
): Op {
  return {
    ...meta(m),
    type: "snapshot.record",
    payload: { row: makeContainerSnapshot(input) },
  };
}

/** Correct a reported value in place (entity-LWW). */
export function updateSnapshot(row: ContainerSnapshot, m?: OpMeta): Op {
  return { ...meta(m), type: "snapshot.update", payload: { row } };
}

/** Remove a mistaken report. The removal is itself an op, so the journal keeps
 * the whole history — state is the replay, the log is the audit trail. */
export function removeSnapshot(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "snapshot.remove", payload: { id } };
}

// ── Settings (M3) ─────────────────────────────────────────────────────────

/** Set any synced preference (entity-LWW by key). */
export function setSetting(key: string, value: string, m?: OpMeta): Op {
  return { ...meta(m), type: "setting.set", payload: { row: makeSetting(key, value) } };
}

/** Default Spending Container (§5.2) — what the compose bar preselects. */
export function setDefaultContainer(containerId: string, m?: OpMeta): Op {
  return setSetting(SETTING.defaultContainerId, containerId, m);
}

/** Convenience re-export for callers reading the snapshot row type. */
export type { ContainerSnapshot };
