import type { Op } from "./types";
import { MemoryTx, newMemoryState, type MemoryState, type Tx } from "./tx";
import { STORE } from "../repo/db";
import type { Category, Container } from "../model";

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
