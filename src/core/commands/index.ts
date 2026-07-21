import {
  makeCategory,
  makeTransaction,
  makeVoidRow,
  newId,
  type Category,
  type CategoryType,
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
