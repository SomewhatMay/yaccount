import type { Category } from "../model/category";
import type { Container } from "../model/container";
import type { Transaction } from "../model/transaction";
import type { ContainerSnapshot } from "../model/containerSnapshot";
import type { Setting } from "../model/setting";
import type { BudgetTarget } from "../model/budgetTarget";
import type { RecurringRule } from "../model/recurringRule";

/**
 * Every mutation is an idempotent op appended to the journal AND applied to the
 * materialized state in a single IndexedDB transaction (§0.1, §8.2). Ops are the
 * atoms of sync; replaying the same op (by `id`) is a no-op.
 *
 * Total order for deterministic convergence is (`ts`, then `id`) — see
 * `compareOps`. The op taxonomy is extended per milestone (impl §3); M1 ships the
 * category + container ops, which are enough to prove the spine (M1 exit criteria).
 */
export interface OpBase {
  id: string; // idempotency key (UUID, or a deterministic seed id)
  ts: string; // ISO timestamp — primary sort key of the total order
}

export type Op =
  | (OpBase & { type: "category.create"; payload: { row: Category } })
  | (OpBase & { type: "category.update"; payload: { row: Category } })
  | (OpBase & { type: "category.archive"; payload: { id: string } })
  // Every soft delete is reversible — undo is a first-class act in this app, not
  // a recovery hatch (§5.5). Restoring is its own op, so the journal shows both.
  | (OpBase & { type: "category.unarchive"; payload: { id: string } })
  | (OpBase & { type: "container.create"; payload: { row: Container } })
  | (OpBase & { type: "container.update"; payload: { row: Container } })
  | (OpBase & { type: "container.archive"; payload: { id: string } })
  | (OpBase & { type: "container.unarchive"; payload: { id: string } })
  // Transactions (M2). create/update carry the full row (entity-LWW, idempotent).
  // void carries a reversing `amount` row (§0.3) — never a destructive delete.
  | (OpBase & { type: "transaction.create"; payload: { row: Transaction } })
  | (OpBase & { type: "transaction.update"; payload: { row: Transaction } })
  | (OpBase & { type: "transaction.void"; payload: { row: Transaction } })
  // A reported real-world value for a container (M3, §5.6). Snapshots accumulate:
  // each report is its own row, so history is never overwritten.
  | (OpBase & { type: "snapshot.record"; payload: { row: ContainerSnapshot } })
  // Corrections to a reported value. A snapshot is an observation the user typed,
  // not a money movement, so it may be edited or removed outright — and because
  // BOTH are ops, the journal still holds every version (§8.2): state is just the
  // replay of record → update → remove under the total order.
  | (OpBase & { type: "snapshot.update"; payload: { row: ContainerSnapshot } })
  | (OpBase & { type: "snapshot.remove"; payload: { id: string } })
  // Synced user preference, keyed by name (M3) — entity-LWW by `key`.
  | (OpBase & { type: "setting.set"; payload: { row: Setting } })
  // A category's budget, effective from a date (M4, §5.3). Unique per
  // (category_id, start_date) — `set` upserts by that natural key, same pattern
  // as snapshot.record/update. `remove` is a hard delete: a superseded row is
  // housekeeping, not a ledger amount (impl §3 rule of thumb).
  | (OpBase & { type: "budgetTarget.set"; payload: { row: BudgetTarget } })
  | (OpBase & { type: "budgetTarget.remove"; payload: { id: string } })
  // Templates (M6, §5.8) — a saved 1-tap shortcut is a transactions row with
  // is_template=true. Not ledger data (nothing derives from it), so `remove` is a
  // genuine hard delete — a shortcut the user deleted, not a money movement.
  | (OpBase & { type: "template.create"; payload: { row: Transaction } })
  | (OpBase & { type: "template.remove"; payload: { id: string } })
  // Recurring rules (M6, §5.8). create/update carry the full row (entity-LWW).
  // cancel/uncancel flip `status` (reversible per §1.1, like archive/unarchive) —
  // a cancelled rule stops generating but stays restorable.
  | (OpBase & { type: "recurringRule.create"; payload: { row: RecurringRule } })
  | (OpBase & { type: "recurringRule.update"; payload: { row: RecurringRule } })
  | (OpBase & { type: "recurringRule.cancel"; payload: { id: string } })
  | (OpBase & { type: "recurringRule.uncancel"; payload: { id: string } })
  // Approve a pending (inbox) row → it becomes a live ledger entry (§5.8). RMW on
  // inbox_status, so it is idempotent and needs only the row id.
  | (OpBase & { type: "transaction.approve"; payload: { id: string } });

export type OpType = Op["type"];
