import type { Op } from "./types";
import { MemoryTx, newMemoryState, type MemoryState, type Tx } from "./tx";
import { STORE } from "../repo/db";
import type { Category, Container, ContainerSnapshot } from "../model";

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
    case "category.archive": {
      const cur = await tx.get<Category>(STORE.categories, op.payload.id);
      if (cur) await tx.put(STORE.categories, { ...cur, is_archived: true });
      return;
    }
    case "container.create":
    case "container.update":
      await tx.put(STORE.containers, op.payload.row);
      return;
    case "container.archive": {
      const cur = await tx.get<Container>(STORE.containers, op.payload.id);
      if (cur) await tx.put(STORE.containers, { ...cur, is_archived: true });
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
