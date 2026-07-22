import type { Op } from "./types";
import { MemoryTx, newMemoryState, type MemoryState, type Tx } from "./tx";
import { STORE } from "../repo/db";
import type {
  BudgetTarget,
  Category,
  Container,
  ContainerSnapshot,
  RecurringRule,
  Transaction,
} from "../model";

/**
 * Upsert a reported value by its natural key `(container_id, date)` — at most
 * ONE report per container per day (§5.6). Logging or editing onto a day that
 * already has one REPLACES it rather than stacking a second reading, and doing
 * it in the reducer means the rule also holds across a device merge (the later
 * op in the total order wins, so every device converges on the same row).
 */
async function putSnapshotUpsert(tx: Tx, row: ContainerSnapshot): Promise<void> {
  const existing = await tx.getAll<ContainerSnapshot>(STORE.containerSnapshots);
  for (const s of existing) {
    if (s.id !== row.id && s.container_id === row.container_id && s.date === row.date) {
      await tx.delete(STORE.containerSnapshots, s.id);
    }
  }
  await tx.put(STORE.containerSnapshots, row);
}

/**
 * Upsert a budget row by its natural key `(category_id, start_date)` (§5.3) —
 * the same pattern as `putSnapshotUpsert`: setting a budget on a date that
 * already has a row REPLACES it rather than stacking a duplicate, and doing it
 * in the reducer means the rule holds across a device merge too.
 */
async function putBudgetTargetUpsert(tx: Tx, row: BudgetTarget): Promise<void> {
  const existing = await tx.getAll<BudgetTarget>(STORE.budgetTargets);
  for (const b of existing) {
    if (
      b.id !== row.id &&
      b.category_id === row.category_id &&
      b.start_date === row.start_date
    ) {
      await tx.delete(STORE.budgetTargets, b.id);
    }
  }
  await tx.put(STORE.budgetTargets, row);
}

/**
 * The single reducer: mutate materialized state for one op. Every branch is
 * idempotent — `put` is last-writer-wins by id (entity-level LWW, §8.5) and
 * `archive` is a read-modify-write that sets a flag — so replaying an op twice
 * leaves state unchanged (§8.2). Never a destructive delete of financial data (§0.3).
 */
export async function applyOp(tx: Tx, op: Op): Promise<void> {
  switch (op.type) {
    case "category.create":
    case "category.update":
      await tx.put(STORE.categories, op.payload.row);
      return;
    case "category.archive":
    case "category.unarchive": {
      const cur = await tx.get<Category>(STORE.categories, op.payload.id);
      const is_archived = op.type === "category.archive";
      if (cur) await tx.put(STORE.categories, { ...cur, is_archived });
      return;
    }
    case "container.create":
    case "container.update":
      await tx.put(STORE.containers, op.payload.row);
      return;
    case "container.archive":
    case "container.unarchive": {
      const cur = await tx.get<Container>(STORE.containers, op.payload.id);
      const is_archived = op.type === "container.archive";
      if (cur) await tx.put(STORE.containers, { ...cur, is_archived });
      return;
    }
    // A void is a NEW reversing row keyed by its own id (§0.3) — `put` is
    // idempotent, and it never touches the original row. All three write the
    // row as-is; the distinction is intent, not reducer behavior.
    case "transaction.create":
    case "transaction.update":
    case "transaction.void":
      await tx.put(STORE.transactions, op.payload.row);
      return;
    // One report per container per day (§5.6): `put` by id, minus any other row
    // holding the same natural key. Idempotent — re-applying leaves the same row.
    case "snapshot.record":
    case "snapshot.update":
      await putSnapshotUpsert(tx, op.payload.row);
      return;
    // The ONLY hard delete in the reducer, and it is deliberate: a snapshot is a
    // typed observation (housekeeping, impl §3), never a ledger amount — no
    // balance depends on it. `delete` of a missing key is a no-op, so replay is
    // idempotent and order-independent under the total order.
    case "snapshot.remove":
      await tx.delete(STORE.containerSnapshots, op.payload.id);
      return;
    // Settings are keyed by name, so `put` is a natural upsert (last writer wins).
    case "setting.set":
      await tx.put(STORE.settings, op.payload.row);
      return;
    // One row per (category_id, start_date) (§5.3): `put` by id, minus any
    // other row holding the same natural key. Idempotent — re-applying leaves
    // the same row.
    case "budgetTarget.set":
      await putBudgetTargetUpsert(tx, op.payload.row);
      return;
    // A hard delete, like snapshot.remove: a superseded budget row is
    // housekeeping (impl §3), not a ledger amount. `delete` of a missing key is
    // a no-op, so replay is idempotent and order-independent under the total order.
    case "budgetTarget.remove":
      await tx.delete(STORE.budgetTargets, op.payload.id);
      return;
    // A template is a transactions row with is_template=true; `put` is idempotent.
    // `remove` is a hard delete — a shortcut is housekeeping, not a ledger amount
    // (impl §3), and nothing derives a balance from it.
    case "template.create":
      await tx.put(STORE.transactions, op.payload.row);
      return;
    case "template.remove":
      await tx.delete(STORE.transactions, op.payload.id);
      return;
    // Recurring rules (M6). create/update `put` the full row (entity-LWW).
    case "recurringRule.create":
    case "recurringRule.update":
      await tx.put(STORE.recurringRules, op.payload.row);
      return;
    // cancel/uncancel flip `status` in place (reversible, §1.1) — the same shape
    // as category/container archive/unarchive, driven by op type. A missing rule
    // is a no-op, so replay stays idempotent and order-independent.
    case "recurringRule.cancel":
    case "recurringRule.uncancel": {
      const cur = await tx.get<RecurringRule>(STORE.recurringRules, op.payload.id);
      const status = op.type === "recurringRule.cancel" ? "cancelled" : "active";
      if (cur) await tx.put(STORE.recurringRules, { ...cur, status });
      return;
    }
    // Approve a pending row → it becomes a live ledger entry. RMW on inbox_status,
    // so re-applying is a no-op. A missing row is a no-op (idempotent replay).
    case "transaction.approve": {
      const cur = await tx.get<Transaction>(STORE.transactions, op.payload.id);
      if (cur) await tx.put(STORE.transactions, { ...cur, inbox_status: "approved" });
      return;
    }
    default: {
      const never: never = op;
      throw new Error(`applyOp: unhandled op type: ${(never as { type: string }).type}`);
    }
  }
}

/** Total order for deterministic convergence: `ts` first, `id` as tiebreak (§8.2). */
export function compareOps(a: Op, b: Op): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Rebuild materialized state by replaying ops under the canonical total order.
 * Convergence depends on the order, not on id-keying alone (impl §5) — so we sort
 * before applying rather than trusting input order.
 */
export async function replay(
  ops: Op[],
  state: MemoryState = newMemoryState(),
): Promise<MemoryState> {
  const tx = new MemoryTx(state);
  for (const op of [...ops].sort(compareOps)) await applyOp(tx, op);
  return state;
}
