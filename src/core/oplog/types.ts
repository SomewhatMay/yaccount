import type { Category } from "../model/category";
import type { Container } from "../model/container";
import type { Transaction } from "../model/transaction";
import type { ContainerSnapshot } from "../model/containerSnapshot";
import type { Setting } from "../model/setting";
import type { BudgetTarget } from "../model/budgetTarget";
import type { RecurringRule } from "../model/recurringRule";
import type { Goal } from "../model/goal";
import type { CravingWin } from "../model/cravingWin";

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
  | (OpBase & { type: "transaction.approve"; payload: { id: string } })
  // Goals (M7, §5.9). create/update carry the full row (entity-LWW). complete
  // latches status→completed + completed_date (RMW; reopen via an ordinary
  // update, §1.1); cancel/uncancel and archive/unarchive are reversible flips —
  // a goal is soft-ended, never hard-deleted (§5.9.6). All RMW ops no-op on a
  // missing goal, so replay stays idempotent and order-independent.
  | (OpBase & { type: "goal.create"; payload: { row: Goal } })
  | (OpBase & { type: "goal.update"; payload: { row: Goal } })
  | (OpBase & { type: "goal.complete"; payload: { id: string; date: string } })
  | (OpBase & { type: "goal.cancel"; payload: { id: string } })
  | (OpBase & { type: "goal.uncancel"; payload: { id: string } })
  | (OpBase & { type: "goal.archive"; payload: { id: string } })
  | (OpBase & { type: "goal.unarchive"; payload: { id: string } })
  // A craving win records avoided spending, not money movement. A linked real
  // transfer remains an ordinary transaction and is committed beside this op.
  | (OpBase & { type: "cravingWin.create"; payload: { row: CravingWin } })
  | (OpBase & { type: "cravingWin.update"; payload: { row: CravingWin } })
  | (OpBase & { type: "cravingWin.remove"; payload: { id: string } });

export type OpType = Op["type"];

/**
 * Every op type this build can apply, as VALUES. The union above is erased at
 * compile time, so anything validating untrusted ops — a hand-edited import file,
 * a file from a future build — needs a runtime list to check against.
 *
 * `satisfies` rejects a name that isn't a real op type; `OP_TYPES_ARE_EXHAUSTIVE`
 * fails to compile when a NEW op type is added to the union and not listed here.
 * A silently missing entry would make `validateExport` reject a perfectly good
 * export, so the guard is the point.
 */
export const OP_TYPES = [
  "category.create",
  "category.update",
  "category.archive",
  "category.unarchive",
  "container.create",
  "container.update",
  "container.archive",
  "container.unarchive",
  "transaction.create",
  "transaction.update",
  "transaction.void",
  "transaction.approve",
  "snapshot.record",
  "snapshot.update",
  "snapshot.remove",
  "setting.set",
  "budgetTarget.set",
  "budgetTarget.remove",
  "template.create",
  "template.remove",
  "recurringRule.create",
  "recurringRule.update",
  "recurringRule.cancel",
  "recurringRule.uncancel",
  "goal.create",
  "goal.update",
  "goal.complete",
  "goal.cancel",
  "goal.uncancel",
  "goal.archive",
  "goal.unarchive",
  "cravingWin.create",
  "cravingWin.update",
  "cravingWin.remove",
] as const satisfies readonly OpType[];

/** Compile-time proof that `OP_TYPES` lists every member of the `Op` union. */
export type OpTypesAreExhaustive =
  Exclude<OpType, (typeof OP_TYPES)[number]> extends never ? true : never;
export const OP_TYPES_ARE_EXHAUSTIVE: OpTypesAreExhaustive = true;

/** Membership test for an untrusted `type` string. */
export function isKnownOpType(value: unknown): value is OpType {
  return typeof value === "string" && (OP_TYPES as readonly string[]).includes(value);
}

/**
 * The op every creation path emits — an expense, an income, a transfer, a
 * quick-logged shortcut, a generated occurrence. Naming it lets a caller read
 * the row it just wrote (to mark it in the register, say) without narrowing the
 * whole union at the call site.
 */
export type TransactionCreateOp = Extract<Op, { type: "transaction.create" }>;
