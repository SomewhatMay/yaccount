import type { IDBPDatabase, IDBPTransaction } from "idb";
import { openDb, STORE, ALL_STORES, STATE_STORES, type StoreName } from "./db";
import {
  applyOp,
  applyInOrder,
  compareOps,
  MemoryTx,
  newMemoryState,
  type Op,
  type Tx,
} from "../oplog";
import { makeGeneralContainer, GENERAL_CONTAINER_ID, type Transaction } from "../model";

const DEVICE_ID_KEY = "deviceId";
// One-shot data passes, marked done in `app_meta` so they never re-run. NOT a
// DB_VERSION bump: IndexedDB records are schemaless, so adding a field needs no
// schema upgrade — and bumping would trip `blocked()` in other tabs and lock out
// older builds for nothing. A failed pass simply retries on the next open.
const MIGRATION_ENTERED_AT = "migration:entered_at";
// Deterministic seed op: same id + epoch ts on every device, so two fresh
// installs converge on a single 'general' wallet (idempotent by op id, §8.2)
// and the seed always sorts first in the total order.
const SEED_GENERAL_OP_ID = "seed:general";
const EPOCH_ISO = new Date(0).toISOString();

/**
 * The deterministic op that brings the default wallet into existence. Same id and
 * same epoch `ts` on every device, so two fresh (or two freshly cleared) installs
 * converge on ONE wallet rather than minting duplicates, and it always sorts
 * first in the total order.
 */
export function seedGeneralOp(): Op {
  return {
    id: SEED_GENERAL_OP_ID,
    ts: EPOCH_ISO,
    type: "container.create",
    payload: { row: makeGeneralContainer() },
  };
}

/**
 * An op set guaranteed to materialize a 'general' wallet.
 *
 * Used by BOTH sides of a reset — the op set written to Drive and the one
 * replayed locally — so the two are byte-identical and every device that adopts
 * the reset lands on exactly the same world. Containers are never hard-deleted,
 * so "some op creates it" is equivalent to "it exists after replay"; an archived
 * wallet is deliberately left archived rather than resurrected.
 */
export function withGeneralWallet(ops: Op[]): Op[] {
  const hasWallet = ops.some(
    (o) => o.type === "container.create" && o.payload.row.id === GENERAL_CONTAINER_ID,
  );
  return hasWallet ? ops : [seedGeneralOp(), ...ops];
}

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
    if (!general) await this.dispatch(seedGeneralOp());
    await this.backfillEnteredAt();
  }

  /**
   * Give pre-M11 transaction rows the instant they were written (`entered_at`),
   * so the register can order a day's entries by when they were logged instead of
   * by a random UUID. The journal already knows: each row's earliest op `ts` is
   * exactly that instant — the same rule `applyOp` uses for new rows, so a
   * backfilled device and a freshly replayed one agree.
   *
   * A row whose creating op has been collapsed away (§8.4 — the deep history
   * lives in an archived Drive ledger) keeps `entered_at: null` and simply sorts
   * to the end of its day. Runs once, guarded by a marker; the whole pass is one
   * transaction, so a crash leaves it un-marked and it retries on the next open.
   */
  private async backfillEnteredAt(): Promise<void> {
    if (await this.db.get(STORE.appMeta, MIGRATION_ENTERED_AT)) return;

    const tx = this.db.transaction(
      [STORE.oplog, STORE.transactions, STORE.appMeta],
      "readwrite",
    );
    try {
      // Earliest op per row id — the write, not a later edit.
      const writtenAt = new Map<string, string>();
      for (const op of (await tx.objectStore(STORE.oplog).getAll()) as Op[]) {
        const row = (op as { payload?: { row?: { id?: string } } }).payload?.row;
        if (!op.type.startsWith("transaction.") && op.type !== "template.create")
          continue;
        if (!row?.id) continue;
        const seen = writtenAt.get(row.id);
        if (seen === undefined || op.ts < seen) writtenAt.set(row.id, op.ts);
      }

      const rows = tx.objectStore(STORE.transactions);
      for (const row of (await rows.getAll()) as Transaction[]) {
        if (row.entered_at != null) continue; // never overwrite what a row carries
        const ts = writtenAt.get(row.id);
        if (ts === undefined) continue;
        await rows.put({ ...row, entered_at: ts });
      }

      await tx.objectStore(STORE.appMeta).put({
        key: MIGRATION_ENTERED_AT,
        value: new Date().toISOString(),
      });
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
   * Append + apply one op atomically; idempotent by op id (§8.2).
   *
   * If `applyOp` throws — realistically an op type from a newer client arriving
   * via sync — the whole transaction is ABORTED, so the journal never keeps an
   * op the state didn't take. Without the abort the `oplog.put` would still
   * commit and this device would carry an op it can never replay: exactly the
   * log/state desync the single transaction exists to prevent (impl §3).
   */
  async dispatch(op: Op): Promise<void> {
    await this.dispatchMany([op]);
  }

  /**
   * Append and apply one user intent containing several ops atomically.
   * Existing op ids are skipped, making an exact retry harmless.
   */
  async dispatchMany(ops: Op[]): Promise<void> {
    const tx = this.db.transaction(ALL_STORES, "readwrite");
    try {
      const oplog = tx.objectStore(STORE.oplog);
      for (const op of ops) {
        if (await oplog.get(op.id)) continue;
        await oplog.put(op);
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

  /** A device-local metadata value (`app_meta`) — never synced, never an op (§8.4). */
  async getMeta<T>(key: string): Promise<T | undefined> {
    const rec = (await this.db.get(STORE.appMeta, key)) as { value: T } | undefined;
    return rec?.value;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.put(STORE.appMeta, { key, value });
  }

  /**
   * Replace this device's entire world with `ops`, in ONE IndexedDB transaction.
   *
   * This is the local half of a clear / import / restore. Unlike `applyRemoteOps`
   * — which unions a delta on top of what is already here (§8.6) — a reset is a
   * deliberate discontinuity: the previous journal, materialized state and outbox
   * all go, and `ops` becomes the whole history. That is only ever correct when
   * the caller has already committed the same op set to Drive, because the outbox
   * is emptied: nothing here will be pushed, since the new world is written to
   * Drive wholesale rather than replayed op-by-op through a ledger.
   *
   * `app_meta` is deliberately preserved — the `deviceId` names this device's
   * ledger file, and minting a fresh one on every clear would litter Drive with
   * orphan ledgers and break the §8.4 one-file-per-device guarantee. `meta` lets
   * the caller stamp the new sync generation inside the same transaction, so a
   * crash can never leave the data reset but the generation unrecorded.
   *
   * Atomic in the strong sense: if any op fails to apply the transaction is
   * ABORTED and this device is exactly as it was — the same guarantee `dispatch`
   * gives, which is what lets an import be "all or nothing" locally.
   */
  async resetTo(
    ops: Op[],
    opts?: { meta?: { key: string; value: unknown }[] },
  ): Promise<void> {
    const sorted = [...ops].sort(compareOps);
    const tx = this.db.transaction(ALL_STORES, "readwrite");
    try {
      for (const store of STATE_STORES) await tx.objectStore(store).clear();
      await tx.objectStore(STORE.oplog).clear();
      await tx.objectStore(STORE.outbox).clear();

      const oplog = tx.objectStore(STORE.oplog);
      for (const op of sorted) await oplog.put(op);
      await applyInOrder(
        new IdbTx(tx as IDBPTransaction<unknown, StoreName[], "readwrite">),
        sorted,
      );

      const appMeta = tx.objectStore(STORE.appMeta);
      for (const { key, value } of opts?.meta ?? []) await appMeta.put({ key, value });

      await tx.done;
    } catch (err) {
      try {
        tx.abort();
      } catch {
        // already settled — the original error is what matters
      }
      await tx.done.catch(() => {});
      throw err;
    }
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
    // Which pulled ops are genuinely new? A steady-state sync re-sees only ops
    // already journaled, so this is empty and we skip the rebuild entirely — the
    // common tick costs one oplog read, not a full clear+replay. Done OUTSIDE the
    // idb transaction (the validation probe below awaits non-idb work, which would
    // auto-close a live tx); a concurrent local `dispatch` only ADDS this device's
    // own already-applied op, so deciding "new" here can't miss a remote change.
    const existing = new Set((await this.listOps()).map((o) => o.id));
    const candidates = remoteOps.filter((o) => !existing.has(o.id));
    if (candidates.length === 0) return;

    // Drop ops this client can't apply (a newer client's op type), so one
    // futuristic op can't wedge sync. Only the NEW candidates are probed —
    // trivial in steady state. Our own payloads are trusted, so this filters type.
    const applicable: Op[] = [];
    for (const op of candidates) {
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
      // Rebuild from the full post-merge journal under the total order. A
      // concurrent local `dispatch` serializes with this tx (overlapping stores),
      // so its op is already in `getAll` and joins the replay — never lost.
      const all = (await oplog.getAll()) as Op[];
      const itx = new IdbTx(tx as IDBPTransaction<unknown, StoreName[], "readwrite">);
      for (const store of STATE_STORES) await tx.objectStore(store).clear();
      await applyInOrder(itx, all);
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
    // Fetch each queued op by id (the outbox is a handful of ops) rather than
    // materializing the whole journal to filter it.
    const ops = await Promise.all(
      entries.map((e) => this.db.get(STORE.oplog, e.id) as Promise<Op | undefined>),
    );
    return ops.filter((o): o is Op => o !== undefined).sort(compareOps);
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
