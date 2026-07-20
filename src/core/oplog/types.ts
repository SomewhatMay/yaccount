import type { Category } from "../model/category";
import type { Container } from "../model/container";

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
  | (OpBase & { type: "container.create"; payload: { row: Container } })
  | (OpBase & { type: "container.update"; payload: { row: Container } })
  | (OpBase & { type: "container.archive"; payload: { id: string } });

export type OpType = Op["type"];
