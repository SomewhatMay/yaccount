import type { IDBPDatabase, IDBPTransaction } from "idb";
import { openDb, STORE, ALL_STORES, STATE_STORES, type StoreName } from "./db";
import {
  applyOp,
  compareOps,
  MemoryTx,
  newMemoryState,
  type Op,
  type Tx,
} from "../oplog";
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

  /**
   * Append + apply one op atomically; idempotent by op id (§8.2).
   *
   * If `applyOp` throws — realistically an op type from a newer client arriving
   * via sync — the whole transaction is ABORTED, so the journal never keeps an
   * op the state didn't take. Without the abort the `oplog.put` would still
   * commit and this device would carry an op it can never replay: exactly the
   * log/state desync the single transaction exists to prevent (impl §3).
   */
  async dispatch(op: Op): Promise<void> {
    const tx = this.db.transaction(ALL_STORES, "readwrite");
    try {
      const oplog = tx.objectStore(STORE.oplog);
      if (!(await oplog.get(op.id))) {
        await oplog.put(op);
        // Enqueue for push to THIS device's ledger (§8.4). Only locally-authored
        // ops land here — `applyRemoteOps` deliberately skips the outbox, so a
        // device never re-uploads another device's op to its own ledger.
        await tx.objectStore(STORE.outbox).put({ id: op.id });
        await applyOp(
          new IdbTx(tx as IDBPTransaction<unknown, StoreName[], "readwrite">),
          op,
        );
      }
      await tx.done;
    } catch (err) {
      try {
        tx.abort();
      } catch {
        // already settled — the original error is what matters
      }
      await tx.done.catch(() => {}); // swallow the abort rejection, not the cause
      throw err;
    }
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

  /**
   * Merge a batch of ops pulled from Drive (snapshot + all device ledgers) into
   * local state (§8.5). This is the seam §8.6 needs and the fix for merge-hole
   * impl §10 #33: `dispatch` applies in arrival order and rows carry no version,
   * so handing remote ops straight to `dispatch` would let a LATE older op
   * clobber a newer local edit. Instead we union the genuinely-new ops into the
   * journal and **rebuild materialized state by replaying the whole journal under
   * the total order** (`compareOps`) — last-writer-wins by (`ts`, `id`), never by
   * arrival. Idempotent by op id (§8.2); a re-pulled op is skipped.
   *
   * It is a rebuild over the UNION (local ops included), so it behaves as a
   * *delta on top of live state*, never a wholesale replace (§8.6): a local edit
   * made mid-sync is in the journal and therefore survives, merging with the
   * incoming remote ops under the same order. `appMeta`/`outbox` are untouched.
   *
   * An op whose type this client can't apply (a newer client's op arriving via
   * sync) is dropped rather than journaled, so one futuristic op can't wedge sync
   * — it is simply re-seen (and re-skipped) on the next pull until this client
   * ships that op type.
   */
  async applyRemoteOps(remoteOps: Op[]): Promise<void> {
    // Pre-validate OUTSIDE the IndexedDB transaction (probing against a scratch
    // in-memory state involves no idb request, and awaiting non-idb work inside a
    // live idb tx would auto-close it). This only filters unknown op types — our
    // own payloads are trusted.
    const applicable: Op[] = [];
    for (const op of remoteOps) {
      try {
        await applyOp(new MemoryTx(newMemoryState()), op);
        applicable.push(op);
      } catch {
        // unknown op type from a newer client — skip; re-evaluated next pull
      }
    }
    if (applicable.length === 0) return;

    const tx = this.db.transaction(ALL_STORES, "readwrite");
    try {
      const oplog = tx.objectStore(STORE.oplog);
      for (const op of applicable) {
        if (!(await oplog.get(op.id))) await oplog.put(op);
      }
      // Rebuild from the full post-merge journal under the canonical order. A
      // concurrent local `dispatch` serializes with this tx (overlapping stores),
      // so its op is already in `getAll` and joins the replay — never lost.
      const all = ((await oplog.getAll()) as Op[]).sort(compareOps);
      const itx = new IdbTx(tx as IDBPTransaction<unknown, StoreName[], "readwrite">);
      for (const store of STATE_STORES) await tx.objectStore(store).clear();
      for (const op of all) await applyOp(itx, op);
      await tx.done;
    } catch (err) {
      try {
        tx.abort();
      } catch {
        // already settled
      }
      await tx.done.catch(() => {});
      throw err;
    }
  }

  /**
   * The locally-authored ops not yet flushed to this device's Drive ledger, in
   * total order (§8.4). The sync layer appends these to `ledger_<deviceId>.json`
   * then calls `clearOutbox` with the flushed ids. Kept as op ids (the journal
   * holds the payloads) so the queue is a thin pointer set.
   */
  async getOutboxOps(): Promise<Op[]> {
    const entries = (await this.db.getAll(STORE.outbox)) as { id: string }[];
    const ids = new Set(entries.map((e) => e.id));
    const ops = (await this.db.getAll(STORE.oplog)) as Op[];
    return ops.filter((o) => ids.has(o.id)).sort(compareOps);
  }

  /** Drop the given ids from the outbox after a successful ledger flush. Ids not
   * in the list stay queued (a mid-flush local dispatch isn't lost). */
  async clearOutbox(ids: string[]): Promise<void> {
    const tx = this.db.transaction(STORE.outbox, "readwrite");
    const store = tx.objectStore(STORE.outbox);
    for (const id of ids) await store.delete(id);
    await tx.done;
  }
}
