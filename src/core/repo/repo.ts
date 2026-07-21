import type { IDBPDatabase, IDBPTransaction } from "idb";
import { openDb, STORE, ALL_STORES, type StoreName } from "./db";
import { applyOp, compareOps, type Op, type Tx } from "../oplog";
import { makeGeneralContainer, GENERAL_CONTAINER_ID } from "../model";

const DEVICE_ID_KEY = "deviceId";
// Deterministic seed op: same id + epoch ts on every device, so two fresh
// installs converge on a single 'general' wallet (idempotent by op id, §8.2)
// and the seed always sorts first in the total order.
const SEED_GENERAL_OP_ID = "seed:general";
const EPOCH_ISO = new Date(0).toISOString();

/** `Tx` backed by a live IndexedDB transaction — the same reducer runs here. */
class IdbTx implements Tx {
  constructor(private readonly tx: IDBPTransaction<unknown, StoreName[], "readwrite">) {}
  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return (await this.tx.objectStore(store).get(key)) as T | undefined;
  }
  async put(store: StoreName, value: unknown): Promise<void> {
    await this.tx.objectStore(store).put(value);
  }
  async delete(store: StoreName, key: IDBValidKey): Promise<void> {
    await this.tx.objectStore(store).delete(key);
  }
  async getAll<T>(store: StoreName): Promise<T[]> {
    return (await this.tx.objectStore(store).getAll()) as T[];
  }
}

/**
 * The local repository: the op-log write path (§3) over IndexedDB. Every mutation
 * goes through `dispatch`, which appends the op to the journal AND applies it to
 * the materialized tables inside ONE IndexedDB transaction (§0.1) — a crash
 * between the two would desync the log from state.
 */
export class Repo {
  private constructor(private readonly db: IDBPDatabase) {}

  static async open(name?: string): Promise<Repo> {
    const db = await openDb(name);
    const repo = new Repo(db);
    await repo.init();
    return repo;
  }

  close(): void {
    this.db.close();
  }

  private async init(): Promise<void> {
    // deviceId: device-local, never synced, never written as an op (§8.4). If
    // IndexedDB is cleared a fresh one is minted → a new ledger file next sync.
    const existing = await this.db.get(STORE.appMeta, DEVICE_ID_KEY);
    if (!existing) {
      await this.db.put(STORE.appMeta, {
        key: DEVICE_ID_KEY,
        value: crypto.randomUUID(),
      });
    }
    // Seed the 'general' wallet as an op so it rides the ledger like any mutation.
    const general = await this.db.get(STORE.containers, GENERAL_CONTAINER_ID);
    if (!general) {
      await this.dispatch({
        id: SEED_GENERAL_OP_ID,
        ts: EPOCH_ISO,
        type: "container.create",
        payload: { row: makeGeneralContainer() },
      });
    }
  }

  /** Append + apply one op atomically; idempotent by op id (§8.2). */
  async dispatch(op: Op): Promise<void> {
    const tx = this.db.transaction(ALL_STORES, "readwrite");
    const oplog = tx.objectStore(STORE.oplog);
    if (!(await oplog.get(op.id))) {
      await oplog.put(op);
      await applyOp(
        new IdbTx(tx as IDBPTransaction<unknown, StoreName[], "readwrite">),
        op,
      );
    }
    await tx.done;
  }

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return (await this.db.get(store, key)) as T | undefined;
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return (await this.db.getAll(store)) as T[];
  }

  async getDeviceId(): Promise<string> {
    const rec = (await this.db.get(STORE.appMeta, DEVICE_ID_KEY)) as
      { value: string } | undefined;
    if (!rec) throw new Error("deviceId missing — init did not run");
    return rec.value;
  }

  /** The full op-log in canonical total order (§8.2). */
  async listOps(): Promise<Op[]> {
    const ops = (await this.db.getAll(STORE.oplog)) as Op[];
    return ops.sort(compareOps);
  }
}
