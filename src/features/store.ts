import { atom } from "jotai";
import { Repo } from "@/core/repo";
import { STORE } from "@/core/repo/db";
import type { Category, Container, Transaction } from "@/core/model";
import type { Op } from "@/core/oplog";

/**
 * Cross-component app state lives in Jotai atoms (boilerplate-free vs. context).
 * The atoms hold a cache of the materialized tables; every mutation goes through
 * `dispatchAtom`, which runs the op-log write path in `core` and then refreshes
 * the caches. This is the UI's single seam onto the repo (impl §3); sync (M9)
 * layers onto the same repo without changing this contract.
 *
 * The `Repo` itself is a side-effectful IndexedDB handle (not rendered UI state),
 * so it is a module-level singleton, not an atom or a context.
 */

export const readyAtom = atom(false);
export const categoriesAtom = atom<Category[]>([]);
export const containersAtom = atom<Container[]>([]);
export const transactionsAtom = atom<Transaction[]>([]);

let repoPromise: Promise<Repo> | null = null;
function getRepo(): Promise<Repo> {
  if (!repoPromise) repoPromise = Repo.open();
  return repoPromise;
}

/** Re-read the materialized tables into the atoms (local-first read path). */
export const refreshAtom = atom(null, async (_get, set) => {
  const repo = await getRepo();
  const [cats, conts, txns] = await Promise.all([
    repo.getAll<Category>(STORE.categories),
    repo.getAll<Container>(STORE.containers),
    repo.getAll<Transaction>(STORE.transactions),
  ]);
  set(categoriesAtom, cats);
  set(containersAtom, conts);
  set(transactionsAtom, txns);
});

/** Append + apply one op atomically (§0.1), then refresh the caches. */
export const dispatchAtom = atom(null, async (_get, set, op: Op) => {
  const repo = await getRepo();
  await repo.dispatch(op);
  await set(refreshAtom);
});

/** Open the repo (seeds 'general' + deviceId on first run), load, mark ready. */
export const bootstrapAtom = atom(null, async (_get, set) => {
  await getRepo();
  await set(refreshAtom);
  set(readyAtom, true);
});
