import { STORE, STATE_STORES, type StoreName } from "../repo/db";

/**
 * Minimal key/value accessor over the materialized stores. Reducers are written
 * against this interface so the SAME `applyOp` runs both over a real IndexedDB
 * transaction (repo) and over an in-memory state (tests / pure replay).
 */
export interface Tx {
  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined>;
  put(store: StoreName, value: unknown): Promise<void>;
  delete(store: StoreName, key: IDBValidKey): Promise<void>;
  getAll<T>(store: StoreName): Promise<T[]>;
}

export type MemoryState = Map<StoreName, Map<string, unknown>>;

export function newMemoryState(): MemoryState {
  const state: MemoryState = new Map();
  for (const s of [...STATE_STORES, STORE.oplog, STORE.appMeta]) state.set(s, new Map());
  return state;
}

function keyOf(value: unknown): string {
  const v = value as { id?: unknown; key?: unknown };
  const k = v.id ?? v.key;
  if (typeof k !== "string") throw new Error("MemoryTx: value has no string id/key");
  return k;
}

/** In-memory `Tx` used for pure reducer tests and total-order replay. */
export class MemoryTx implements Tx {
  constructor(private readonly state: MemoryState) {}

  private bucket(store: StoreName): Map<string, unknown> {
    let b = this.state.get(store);
    if (!b) {
      b = new Map();
      this.state.set(store, b);
    }
    return b;
  }

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return this.bucket(store).get(String(key)) as T | undefined;
  }
  async put(store: StoreName, value: unknown): Promise<void> {
    this.bucket(store).set(keyOf(value), value);
  }
  async delete(store: StoreName, key: IDBValidKey): Promise<void> {
    this.bucket(store).delete(String(key));
  }
  async getAll<T>(store: StoreName): Promise<T[]> {
    return [...this.bucket(store).values()] as T[];
  }
}
