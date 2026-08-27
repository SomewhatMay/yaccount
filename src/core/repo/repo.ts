import type { IDBPDatabase, IDBPTransaction } from "idb";
import {
  openDb,
  DB_NAME,
  DB_VERSION,
  STORE,
  ALL_STORES,
  READ_STORES,
  STATE_STORES,
  INDEX,
  type StoreName,
} from "./db";
import {
  applyOp,
  applyInOrder,
  compareOps,
  MemoryTx,
  newMemoryState,
  type Op,
  type Tx,
} from "../oplog";
import {
  makeGeneralContainer,
  GENERAL_CONTAINER_ID,
  type Category,
  type Container,
  type Transaction,
} from "../model";
import { matchesFilter, type TransactionFilter } from "../engine/filter";
import {
  deriveLedgerReadModel,
  entryIndexKey,
  ledgerUsageContributions,
  ledgerUsageRecent,
  LEDGER_READ_MODEL_VERSION,
  LEDGER_READ_REVISION_KEY,
  LEDGER_READ_VERSION_KEY,
  type EntryRead,
  type LedgerBalanceBucket,
  type LedgerContainerFact,
  type LedgerReadState,
  type LedgerReadSort,
  type LedgerUsageContribution,
  type LedgerUsageFact,
} from "./ledger-read";

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

export interface RepoDiagnosticEvent {
  message: string;
  facts: Record<string, string | number | boolean>;
}

type RepoDiagnosticSink = (event: RepoDiagnosticEvent) => void;
const ignoreDiagnostics: RepoDiagnosticSink = () => {};
const elapsed = (startedAt: number): number => Math.max(0, Date.now() - startedAt);

export interface LedgerPageQuery {
  sort: LedgerReadSort;
  limit: number;
  cursor: string | null;
  filter?: TransactionFilter;
}

export interface LedgerPageResult {
  rows: EntryRead[];
  cursor: string | null;
  revision: number;
  complete: boolean;
  staleCursor: boolean;
}

export interface LedgerScanQuery {
  sort: LedgerReadSort;
  candidateLimit: number;
  matchLimit?: number;
  cursor: string | null;
  filter?: TransactionFilter;
}

export interface SearchEntryScanQuery {
  candidateLimit: number;
  cursor: string | null;
}

export interface SearchEntryScanResult {
  rows: EntryRead[];
  cursor: string | null;
  revision: number;
  complete: boolean;
  staleCursor: boolean;
}

export interface LedgerFocusQuery {
  id: string;
  sort: LedgerReadSort;
  limit: number;
}

export interface LedgerFocusResult {
  rows: EntryRead[];
  revision: number;
  completeBefore: boolean;
  completeAfter: boolean;
}

export interface LedgerReadSnapshot {
  revision: number;
  ledgerCount: number;
  pending: EntryRead[];
  templates: EntryRead[];
  containerFacts: LedgerContainerFact[];
  usageFacts: LedgerUsageFact[];
}

interface LedgerCursorToken {
  version: number;
  revision: number;
  sort: LedgerReadSort;
  filter: string;
  key: IDBValidKey;
}

interface SearchCursorToken {
  version: number;
  revision: number;
  key: IDBValidKey;
}

function isTransactionOp(op: Op): boolean {
  return op.type.startsWith("transaction.") || op.type.startsWith("template.");
}

function transactionOpRowId(op: Op): string | null {
  switch (op.type) {
    case "transaction.create":
    case "transaction.update":
    case "transaction.void":
    case "template.create":
      return op.payload.row.id;
    case "transaction.approve":
    case "template.remove":
      return op.payload.id;
    default:
      return null;
  }
}

function filterSignature(filter: TransactionFilter | undefined): string {
  return JSON.stringify(filter ?? {});
}

function parseCursor(value: string): LedgerCursorToken {
  const parsed = JSON.parse(value) as Partial<LedgerCursorToken>;
  if (
    parsed.version !== LEDGER_READ_MODEL_VERSION ||
    typeof parsed.revision !== "number" ||
    typeof parsed.sort !== "string" ||
    typeof parsed.filter !== "string" ||
    parsed.key === undefined
  ) {
    throw new Error("invalid Ledger cursor");
  }
  return parsed as LedgerCursorToken;
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
  private constructor(
    private readonly db: IDBPDatabase,
    private readonly diagnostic: RepoDiagnosticSink,
  ) {}

  static async open(
    name?: string,
    diagnostic: RepoDiagnosticSink = ignoreDiagnostics,
  ): Promise<Repo> {
    const report: RepoDiagnosticSink = (event) => {
      try {
        diagnostic(event);
      } catch {
        // Diagnostics is optional evidence, never part of database correctness.
      }
    };
    const startedAt = Date.now();
    const facts = { database: name ?? DB_NAME, schemaVersion: DB_VERSION };
    report({ message: "database open started", facts });
    try {
      const db = await openDb(name);
      const repo = new Repo(db, report);
      await repo.init();
      report({
        message: "database open succeeded",
        facts: { ...facts, durationMs: elapsed(startedAt) },
      });
      return repo;
    } catch (error) {
      report({
        message: "database open failed",
        facts: { ...facts, durationMs: elapsed(startedAt) },
      });
      throw error;
    }
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
    await this.ensureLedgerReadModel();
  }

  private async bumpLedgerRevision(
    tx: IDBPTransaction<unknown, StoreName[], "readwrite">,
  ): Promise<number> {
    const meta = tx.objectStore(STORE.appMeta);
    const current = (await meta.get(LEDGER_READ_REVISION_KEY)) as
      | { value: number }
      | undefined;
    const revision = (current?.value ?? 0) + 1;
    await meta.put({ key: LEDGER_READ_REVISION_KEY, value: revision });
    return revision;
  }

  private async rebuildLedgerReadModel(
    tx: IDBPTransaction<unknown, StoreName[], "readwrite">,
  ): Promise<number> {
    const transactions = (await tx.objectStore(STORE.transactions).getAll()) as Transaction[];
    const model = deriveLedgerReadModel(transactions);
    for (const store of READ_STORES) await tx.objectStore(store).clear();
    const entries = tx.objectStore(STORE.entryRead);
    for (const entry of model.entries) await entries.put(entry);
    const buckets = tx.objectStore(STORE.ledgerBalanceBucket);
    for (const bucket of model.buckets) await buckets.put(bucket);
    const facts = tx.objectStore(STORE.ledgerReadFact);
    for (const fact of model.facts.values()) await facts.put(fact);
    for (const fact of model.usage) await facts.put(fact);
    for (const [state, count] of Object.entries(model.counts)) {
      await facts.put({ id: `count:${state}`, state, count });
    }
    await tx.objectStore(STORE.appMeta).put({
      key: LEDGER_READ_VERSION_KEY,
      value: LEDGER_READ_MODEL_VERSION,
    });
    return this.bumpLedgerRevision(tx);
  }

  private async ensureLedgerReadModel(): Promise<void> {
    const marker = (await this.db.get(STORE.appMeta, LEDGER_READ_VERSION_KEY)) as
      | { value: number }
      | undefined;
    if (marker?.value === LEDGER_READ_MODEL_VERSION) return;
    const tx = this.db.transaction(
      [STORE.transactions, ...READ_STORES, STORE.appMeta],
      "readwrite",
    );
    try {
      await this.rebuildLedgerReadModel(
        tx as IDBPTransaction<unknown, StoreName[], "readwrite">,
      );
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // already settled
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }

  private async adjustFinancialRow(
    tx: IDBPTransaction<unknown, StoreName[], "readwrite">,
    row: Transaction,
    sign: 1 | -1,
  ): Promise<void> {
    const model = deriveLedgerReadModel([row]);
    const buckets = tx.objectStore(STORE.ledgerBalanceBucket);
    for (const delta of model.buckets) {
      const current = (await buckets.get(delta.id)) as LedgerBalanceBucket | undefined;
      const next: LedgerBalanceBucket = {
        ...(current ?? {
          id: delta.id,
          period: delta.period,
          containerId: delta.containerId,
          key: delta.key,
          balanceDelta: 0,
          transferInflow: 0,
          transferOutflow: 0,
          netContribution: 0,
          ordinaryIn: 0,
          ordinaryOut: 0,
          ordinaryCount: 0,
        }),
        balanceDelta: (current?.balanceDelta ?? 0) + sign * delta.balanceDelta,
        transferInflow: (current?.transferInflow ?? 0) + sign * delta.transferInflow,
        transferOutflow: (current?.transferOutflow ?? 0) + sign * delta.transferOutflow,
        netContribution:
          (current?.netContribution ?? 0) + sign * delta.netContribution,
        ordinaryIn: (current?.ordinaryIn ?? 0) + sign * delta.ordinaryIn,
        ordinaryOut: (current?.ordinaryOut ?? 0) + sign * delta.ordinaryOut,
        ordinaryCount: (current?.ordinaryCount ?? 0) + sign * delta.ordinaryCount,
      };
      if (
        next.balanceDelta === 0 &&
        next.transferInflow === 0 &&
        next.transferOutflow === 0 &&
        next.netContribution === 0
        && next.ordinaryIn === 0
        && next.ordinaryOut === 0
        && next.ordinaryCount === 0
      ) {
        await buckets.delete(next.id);
      } else {
        await buckets.put(next);
      }
    }
    const facts = tx.objectStore(STORE.ledgerReadFact);
    for (const delta of model.facts.values()) {
      const current = (await facts.get(delta.id)) as LedgerContainerFact | undefined;
      const next: LedgerContainerFact = {
        id: delta.id,
        containerId: delta.containerId,
        balance: (current?.balance ?? 0) + sign * delta.balance,
        netContribution:
          (current?.netContribution ?? 0) + sign * delta.netContribution,
      };
      await facts.put(next);
    }
  }

  private async collectTransactionComponent(
    tx: IDBPTransaction<unknown, StoreName[], "readwrite">,
    seedIds: Iterable<string>,
  ): Promise<{ ids: Set<string>; rows: Transaction[] }> {
    const transactions = tx.objectStore(STORE.transactions);
    const children = transactions.index(INDEX.transactionsByReversesId);
    const queued = [...seedIds];
    const ids = new Set<string>();
    const rows = new Map<string, Transaction>();
    while (queued.length > 0) {
      const id = queued.pop()!;
      if (ids.has(id)) continue;
      ids.add(id);
      const row = (await transactions.get(id)) as Transaction | undefined;
      if (!row) continue;
      rows.set(id, row);
      if (row.reverses_id) queued.push(row.reverses_id);
      for (const child of (await children.getAll(id)) as Transaction[]) {
        queued.push(child.id);
      }
    }
    return { ids, rows: [...rows.values()] };
  }

  private async updateLedgerReadModel(
    tx: IDBPTransaction<unknown, StoreName[], "readwrite">,
    oldRows: Map<string, Transaction | undefined>,
  ): Promise<void> {
    const transactions = tx.objectStore(STORE.transactions);
    const seeds = new Set(oldRows.keys());
    for (const old of oldRows.values()) if (old?.reverses_id) seeds.add(old.reverses_id);
    for (const [id, old] of oldRows) {
      const current = (await transactions.get(id)) as Transaction | undefined;
      if (current?.reverses_id) seeds.add(current.reverses_id);
      if (old) await this.adjustFinancialRow(tx, old, -1);
      if (current) await this.adjustFinancialRow(tx, current, 1);
    }

    const component = await this.collectTransactionComponent(tx, seeds);
    const entries = tx.objectStore(STORE.entryRead);
    const countDelta: Record<LedgerReadState, number> = {
      ledger: 0,
      pending: 0,
      template: 0,
    };
    const previousEntries: EntryRead[] = [];
    for (const id of component.ids) {
      const existing = (await entries.get(id)) as EntryRead | undefined;
      if (existing) {
        previousEntries.push(existing);
        countDelta[existing.state] -= 1;
      }
      await entries.delete(id);
    }
    const projected = deriveLedgerReadModel(component.rows).entries;
    for (const entry of projected) {
      await entries.put(entry);
      countDelta[entry.state] += 1;
    }
    await this.updateUsageFacts(tx, previousEntries, projected);
    const facts = tx.objectStore(STORE.ledgerReadFact);
    for (const state of ["ledger", "pending", "template"] as const) {
      if (countDelta[state] === 0) continue;
      const id = `count:${state}`;
      const current = (await facts.get(id)) as { id: string; state: string; count: number };
      await facts.put({ id, state, count: (current?.count ?? 0) + countDelta[state] });
    }
    await this.bumpLedgerRevision(tx);
  }

  private async latestUsageEntry(
    tx: IDBPTransaction<unknown, StoreName[], "readwrite">,
    contribution: LedgerUsageContribution,
  ): Promise<EntryRead | undefined> {
    const store = tx.objectStore(STORE.entryRead);
    const latestFrom = async (
      indexName: string,
      prefix: IDBValidKey[],
    ): Promise<EntryRead | undefined> => {
      const cursor = await store
        .index(indexName)
        .openCursor(IDBKeyRange.bound(prefix, [...prefix, []]), "prev");
      return cursor?.value as EntryRead | undefined;
    };
    if (contribution.selector === "category") {
      return latestFrom(INDEX.entryCategoryChronology, [
        "ledger",
        contribution.categoryId!,
      ]);
    }
    if (contribution.selector === "vendor") {
      return latestFrom(INDEX.entryVendorUsage, [
        "ledger",
        contribution.subject,
        contribution.categoryId!,
        contribution.containerId!,
      ]);
    }
    if (contribution.selector === "shortcut") {
      return latestFrom(INDEX.entryShortcutUsage, ["ledger", contribution.shape!]);
    }
    const source = await latestFrom(INDEX.entrySourceChronology, [
      "ledger",
      contribution.containerId!,
    ]);
    const destination = await latestFrom(INDEX.entryDestinationChronology, [
      "ledger",
      contribution.containerId!,
    ]);
    if (!source) return destination;
    if (!destination) return source;
    const sourceRecent = ledgerUsageRecent(source);
    const destinationRecent = ledgerUsageRecent(destination);
    return sourceRecent > destinationRecent ||
      (sourceRecent === destinationRecent && source.id > destination.id)
      ? source
      : destination;
  }

  private usageFact(
    contribution: LedgerUsageContribution,
    row: EntryRead,
    count: number,
  ): LedgerUsageFact {
    return {
      id: contribution.id,
      kind: contribution.kind,
      subject: contribution.subject,
      count,
      recent: ledgerUsageRecent(row),
      recentId: row.id,
      ...(contribution.value === undefined ? {} : { value: contribution.value }),
      ...(contribution.categoryId === undefined
        ? {}
        : { categoryId: contribution.categoryId }),
      ...(contribution.containerId === undefined
        ? {}
        : { containerId: contribution.containerId }),
      ...(contribution.shape === undefined ? {} : { shape: contribution.shape }),
    };
  }

  private async updateUsageFacts(
    tx: IDBPTransaction<unknown, StoreName[], "readwrite">,
    removed: EntryRead[],
    added: EntryRead[],
  ): Promise<void> {
    const facts = tx.objectStore(STORE.ledgerReadFact);
    for (const row of removed.filter((entry) => entry.state === "ledger")) {
      for (const contribution of ledgerUsageContributions(row)) {
        const current = (await facts.get(contribution.id)) as LedgerUsageFact | undefined;
        if (!current) continue;
        const count = current.count - 1;
        if (count <= 0) {
          await facts.delete(contribution.id);
          continue;
        }
        if (current.recentId === row.id) {
          const latest = await this.latestUsageEntry(tx, contribution);
          if (!latest) {
            await facts.delete(contribution.id);
            continue;
          }
          const latestContribution = ledgerUsageContributions(latest).find(
            (candidate) => candidate.id === contribution.id,
          );
          if (!latestContribution) throw new Error("usage selector mismatch");
          await facts.put(this.usageFact(latestContribution, latest, count));
        } else {
          await facts.put({ ...current, count });
        }
      }
    }
    for (const row of added.filter((entry) => entry.state === "ledger")) {
      for (const contribution of ledgerUsageContributions(row)) {
        const current = (await facts.get(contribution.id)) as LedgerUsageFact | undefined;
        const recent = ledgerUsageRecent(row);
        const newest =
          !current ||
          recent > current.recent ||
          (recent === current.recent && row.id > current.recentId);
        await facts.put(
          newest
            ? this.usageFact(contribution, row, (current?.count ?? 0) + 1)
            : { ...current, count: current.count + 1 },
        );
      }
    }
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

    const startedAt = Date.now();
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
      this.diagnostic({
        message: "database data migration succeeded",
        facts: { migration: "entered_at", durationMs: elapsed(startedAt) },
      });
    } catch (err) {
      try {
        tx.abort();
      } catch {
        // already settled
      }
      await tx.done.catch(() => {});
      this.diagnostic({
        message: "database data migration failed",
        facts: { migration: "entered_at", durationMs: elapsed(startedAt) },
      });
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
      let wrote = false;
      let rebuildReadModel = false;
      const oldTransactions = new Map<string, Transaction | undefined>();
      for (const op of ops) {
        if (await oplog.get(op.id)) continue;
        wrote = true;
        rebuildReadModel ||= isTransactionOp(op);
        const transactionId = transactionOpRowId(op);
        if (transactionId !== null && !oldTransactions.has(transactionId)) {
          oldTransactions.set(
            transactionId,
            (await tx.objectStore(STORE.transactions).get(transactionId)) as
              | Transaction
              | undefined,
          );
        }
        await oplog.put(op);
        await tx.objectStore(STORE.outbox).put({ id: op.id });
        await applyOp(
          new IdbTx(tx as IDBPTransaction<unknown, StoreName[], "readwrite">),
          op,
        );
      }
      if (wrote) {
        if (rebuildReadModel) {
          await this.updateLedgerReadModel(
            tx as IDBPTransaction<unknown, StoreName[], "readwrite">,
            oldTransactions,
          );
        } else {
          await this.bumpLedgerRevision(
            tx as IDBPTransaction<unknown, StoreName[], "readwrite">,
          );
        }
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

  async getContainerFact(containerId: string): Promise<LedgerContainerFact | undefined> {
    return (await this.db.get(
      STORE.ledgerReadFact,
      `container:${containerId}`,
    )) as LedgerContainerFact | undefined;
  }

  async getUsageFacts(): Promise<LedgerUsageFact[]> {
    const facts = (await this.db.getAll(STORE.ledgerReadFact)) as Array<
      LedgerUsageFact | LedgerContainerFact | { id: string }
    >;
    return facts.filter(
      (fact): fact is LedgerUsageFact =>
        "kind" in fact &&
        ["category", "container", "vendor", "shortcut"].includes(fact.kind),
    );
  }

  async getLedgerReadSnapshot(): Promise<LedgerReadSnapshot> {
    const tx = this.db.transaction(
      [STORE.entryRead, STORE.ledgerReadFact, STORE.appMeta],
      "readonly",
    );
    const entries = tx.objectStore(STORE.entryRead).index(INDEX.entryChronology);
    const collection = async (state: "pending" | "template") => {
      const rows: EntryRead[] = [];
      let cursor = await entries.openCursor(
        IDBKeyRange.bound([state], [state, []]),
        "next",
      );
      while (cursor) {
        rows.push(cursor.value as EntryRead);
        cursor = await cursor.continue();
      }
      return rows;
    };
    const pending = await collection("pending");
    const templates = await collection("template");
    const facts = (await tx.objectStore(STORE.ledgerReadFact).getAll()) as Array<
      LedgerUsageFact | LedgerContainerFact | { id: string; state?: string; count?: number }
    >;
    const revisionRecord = (await tx
      .objectStore(STORE.appMeta)
      .get(LEDGER_READ_REVISION_KEY)) as { value: number } | undefined;
    await tx.done;
    const ledgerCount = facts.find((fact) => fact.id === "count:ledger");
    return {
      revision: revisionRecord?.value ?? 0,
      ledgerCount: ledgerCount && "count" in ledgerCount ? ledgerCount.count ?? 0 : 0,
      pending,
      templates,
      containerFacts: facts.filter(
        (fact): fact is LedgerContainerFact => "containerId" in fact && "balance" in fact,
      ),
      usageFacts: facts.filter(
        (fact): fact is LedgerUsageFact =>
          "kind" in fact &&
          ["category", "container", "vendor", "shortcut"].includes(fact.kind),
      ),
    };
  }

  async getLedgerPage(query: LedgerPageQuery): Promise<LedgerPageResult> {
    if (!Number.isInteger(query.limit) || query.limit <= 0) {
      throw new Error("Ledger page limit must be a positive integer");
    }
    const signature = filterSignature(query.filter);
    const token = query.cursor === null ? null : parseCursor(query.cursor);
    if (token && (token.sort !== query.sort || token.filter !== signature)) {
      throw new Error("Ledger cursor does not match the query");
    }
    const tx = this.db.transaction(
      [STORE.entryRead, STORE.appMeta, STORE.categories, STORE.containers],
      "readonly",
    );
    const meta = (await tx.objectStore(STORE.appMeta).get(LEDGER_READ_REVISION_KEY)) as
      | { value: number }
      | undefined;
    const revision = meta?.value ?? 0;
    const staleCursor = token !== null && token.revision !== revision;
    const categories = (await tx.objectStore(STORE.categories).getAll()) as Category[];
    const containers = (await tx.objectStore(STORE.containers).getAll()) as Container[];
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
    const containerNames = new Map(
      containers.map((container) => [container.id, container.name]),
    );
    const label = (row: Transaction): string =>
      [
        row.category_id ? categoryNames.get(row.category_id) : "Transfer",
        containerNames.get(row.container_id),
        row.to_container_id ? containerNames.get(row.to_container_id) : undefined,
      ]
        .filter(Boolean)
        .join(" ");
    const direction: IDBCursorDirection =
      query.sort === "newest" || query.sort === "largest" ? "prev" : "next";
    const indexName =
      query.sort === "largest"
        ? INDEX.entryLargest
        : query.sort === "smallest"
          ? INDEX.entrySmallest
          : INDEX.entryChronology;
    const lower: IDBValidKey = ["ledger"];
    const upper: IDBValidKey = ["ledger", []];
    const range = token
      ? direction === "next"
        ? IDBKeyRange.bound(token.key, upper, true, false)
        : IDBKeyRange.bound(lower, token.key, false, true)
      : IDBKeyRange.bound(lower, upper);
    const index = tx.objectStore(STORE.entryRead).index(indexName);
    let cursor = await index.openCursor(range, direction);
    const rows: EntryRead[] = [];
    let lastKey: IDBValidKey | null = null;
    let hasMore = false;
    while (cursor) {
      const entry = cursor.value as EntryRead;
      if (matchesFilter(entry, query.filter ?? {}, { label })) {
        if (rows.length === query.limit) {
          hasMore = true;
          break;
        }
        rows.push(entry);
        lastKey = entryIndexKey(entry, query.sort);
      }
      cursor = await cursor.continue();
    }
    await tx.done;
    const nextToken =
      hasMore && lastKey !== null
        ? JSON.stringify({
            version: LEDGER_READ_MODEL_VERSION,
            revision,
            sort: query.sort,
            filter: signature,
            key: lastKey,
          } satisfies LedgerCursorToken)
        : null;
    return {
      rows,
      cursor: nextToken,
      revision,
      complete: !hasMore,
      staleCursor,
    };
  }

  async scanLedgerEntries(query: LedgerScanQuery): Promise<LedgerPageResult> {
    if (!Number.isInteger(query.candidateLimit) || query.candidateLimit <= 0) {
      throw new Error("Ledger scan candidate limit must be a positive integer");
    }
    const matchLimit = query.matchLimit ?? Number.POSITIVE_INFINITY;
    if (matchLimit !== Number.POSITIVE_INFINITY && (!Number.isInteger(matchLimit) || matchLimit <= 0)) {
      throw new Error("Ledger scan match limit must be a positive integer");
    }
    const signature = filterSignature(query.filter);
    const token = query.cursor === null ? null : parseCursor(query.cursor);
    if (token && (token.sort !== query.sort || token.filter !== signature)) {
      throw new Error("Ledger cursor does not match the query");
    }
    const tx = this.db.transaction(
      [STORE.entryRead, STORE.appMeta, STORE.categories, STORE.containers],
      "readonly",
    );
    const meta = (await tx.objectStore(STORE.appMeta).get(LEDGER_READ_REVISION_KEY)) as
      | { value: number }
      | undefined;
    const revision = meta?.value ?? 0;
    const categories = (await tx.objectStore(STORE.categories).getAll()) as Category[];
    const containers = (await tx.objectStore(STORE.containers).getAll()) as Container[];
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
    const containerNames = new Map(
      containers.map((container) => [container.id, container.name]),
    );
    const label = (row: Transaction): string =>
      [
        row.category_id ? categoryNames.get(row.category_id) : "Transfer",
        containerNames.get(row.container_id),
        row.to_container_id ? containerNames.get(row.to_container_id) : undefined,
      ]
        .filter(Boolean)
        .join(" ");
    const direction: IDBCursorDirection =
      query.sort === "newest" || query.sort === "largest" ? "prev" : "next";
    const indexName =
      query.sort === "largest"
        ? INDEX.entryLargest
        : query.sort === "smallest"
          ? INDEX.entrySmallest
          : INDEX.entryChronology;
    const lower: IDBValidKey = ["ledger"];
    const upper: IDBValidKey = ["ledger", []];
    const range = token
      ? direction === "next"
        ? IDBKeyRange.bound(token.key, upper, true, false)
        : IDBKeyRange.bound(lower, token.key, false, true)
      : IDBKeyRange.bound(lower, upper);
    const index = tx.objectStore(STORE.entryRead).index(indexName);
    let cursor = await index.openCursor(range, direction);
    const rows: EntryRead[] = [];
    let scanned = 0;
    let lastKey: IDBValidKey | null = null;
    while (cursor && scanned < query.candidateLimit && rows.length < matchLimit) {
      const entry = cursor.value as EntryRead;
      if (matchesFilter(entry, query.filter ?? {}, { label })) rows.push(entry);
      lastKey = entryIndexKey(entry, query.sort);
      scanned += 1;
      cursor = await cursor.continue();
    }
    const complete = cursor === null;
    await tx.done;
    const nextToken =
      !complete && lastKey !== null
        ? JSON.stringify({
            version: LEDGER_READ_MODEL_VERSION,
            revision,
            sort: query.sort,
            filter: signature,
            key: lastKey,
          } satisfies LedgerCursorToken)
        : null;
    return {
      rows,
      cursor: nextToken,
      revision,
      complete,
      staleCursor: token !== null && token.revision !== revision,
    };
  }

  async scanSearchEntries(query: SearchEntryScanQuery): Promise<SearchEntryScanResult> {
    if (!Number.isInteger(query.candidateLimit) || query.candidateLimit <= 0) {
      throw new Error("Search scan candidate limit must be a positive integer");
    }
    const token =
      query.cursor === null
        ? null
        : (JSON.parse(query.cursor) as SearchCursorToken);
    if (token && token.version !== LEDGER_READ_MODEL_VERSION) {
      throw new Error("invalid Search cursor");
    }
    const tx = this.db.transaction([STORE.entryRead, STORE.appMeta], "readonly");
    const revisionRecord = (await tx
      .objectStore(STORE.appMeta)
      .get(LEDGER_READ_REVISION_KEY)) as { value: number } | undefined;
    const revision = revisionRecord?.value ?? 0;
    const store = tx.objectStore(STORE.entryRead);
    const range = token ? IDBKeyRange.lowerBound(token.key, true) : undefined;
    let cursor = await store.openCursor(range, "next");
    const rows: EntryRead[] = [];
    let lastKey: IDBValidKey | null = null;
    while (cursor && rows.length < query.candidateLimit) {
      rows.push(cursor.value as EntryRead);
      lastKey = cursor.primaryKey;
      cursor = await cursor.continue();
    }
    const complete = cursor === null;
    await tx.done;
    return {
      rows,
      cursor:
        !complete && lastKey !== null
          ? JSON.stringify({
              version: LEDGER_READ_MODEL_VERSION,
              revision,
              key: lastKey,
            } satisfies SearchCursorToken)
          : null,
      revision,
      complete,
      staleCursor: token !== null && token.revision !== revision,
    };
  }

  async getEntryCollection(state: LedgerReadState): Promise<EntryRead[]> {
    const tx = this.db.transaction(STORE.entryRead, "readonly");
    const index = tx.objectStore(STORE.entryRead).index(INDEX.entryChronology);
    const range = IDBKeyRange.bound([state], [state, []]);
    const rows: EntryRead[] = [];
    let cursor = await index.openCursor(range, "next");
    while (cursor) {
      rows.push(cursor.value as EntryRead);
      cursor = await cursor.continue();
    }
    await tx.done;
    return rows;
  }

  async getLedgerRange(start: string, end: string): Promise<EntryRead[]> {
    const tx = this.db.transaction(STORE.entryRead, "readonly");
    const index = tx.objectStore(STORE.entryRead).index(INDEX.entryChronology);
    const rows = (await index.getAll(
      IDBKeyRange.bound(["ledger", start], ["ledger", end, []]),
    )) as EntryRead[];
    await tx.done;
    return rows;
  }

  async getLedgerEntriesById(ids: readonly string[]): Promise<EntryRead[]> {
    const tx = this.db.transaction(STORE.entryRead, "readonly");
    const store = tx.objectStore(STORE.entryRead);
    const rows: EntryRead[] = [];
    for (const id of ids) {
      const row = (await store.get(id)) as EntryRead | undefined;
      if (row?.state === "ledger") rows.push(row);
    }
    await tx.done;
    return rows;
  }

  async getLedgerFocus(query: LedgerFocusQuery): Promise<LedgerFocusResult> {
    if (!Number.isInteger(query.limit) || query.limit <= 0) {
      throw new Error("Ledger focus limit must be a positive integer");
    }
    const tx = this.db.transaction([STORE.entryRead, STORE.appMeta], "readonly");
    const store = tx.objectStore(STORE.entryRead);
    const target = (await store.get(query.id)) as EntryRead | undefined;
    const meta = (await tx.objectStore(STORE.appMeta).get(LEDGER_READ_REVISION_KEY)) as
      | { value: number }
      | undefined;
    if (!target || target.state !== "ledger") {
      await tx.done;
      return {
        rows: [],
        revision: meta?.value ?? 0,
        completeBefore: true,
        completeAfter: true,
      };
    }
    const indexName =
      query.sort === "largest"
        ? INDEX.entryLargest
        : query.sort === "smallest"
          ? INDEX.entrySmallest
          : INDEX.entryChronology;
    const index = store.index(indexName);
    const key = entryIndexKey(target, query.sort);
    const displayDirection: IDBCursorDirection =
      query.sort === "newest" || query.sort === "largest" ? "prev" : "next";
    const oppositeDirection: IDBCursorDirection =
      displayDirection === "next" ? "prev" : "next";
    const scan = async (
      direction: IDBCursorDirection,
      limit: number,
    ): Promise<{ rows: EntryRead[]; complete: boolean }> => {
      const lower: IDBValidKey = ["ledger"];
      const upper: IDBValidKey = ["ledger", []];
      const range =
        direction === "next"
          ? IDBKeyRange.bound(key, upper, true, false)
          : IDBKeyRange.bound(lower, key, false, true);
      const rows: EntryRead[] = [];
      let cursor = await index.openCursor(range, direction);
      while (cursor && rows.length < limit) {
        rows.push(cursor.value as EntryRead);
        cursor = await cursor.continue();
      }
      return { rows, complete: cursor === null };
    };

    const preferredBefore = Math.floor((query.limit - 1) / 2);
    let before = await scan(oppositeDirection, preferredBefore);
    let after = await scan(displayDirection, query.limit - 1 - before.rows.length);
    if (after.rows.length < query.limit - 1 - before.rows.length) {
      before = await scan(oppositeDirection, query.limit - 1 - after.rows.length);
    }
    await tx.done;
    return {
      rows: [...before.rows.reverse(), target, ...after.rows],
      revision: meta?.value ?? 0,
      completeBefore: before.complete,
      completeAfter: after.complete,
    };
  }

  async getOverallBalanceSeries(
    containerIds: readonly string[],
    days: readonly string[],
  ): Promise<number[]> {
    if (days.length === 0 || containerIds.length === 0) return days.map(() => 0);
    const tx = this.db.transaction(STORE.ledgerBalanceBucket, "readonly");
    const index = tx
      .objectStore(STORE.ledgerBalanceBucket)
      .index(INDEX.balanceBucketByPeriodContainer);
    const byContainer = new Map<
      string,
      { months: LedgerBalanceBucket[]; days: LedgerBalanceBucket[] }
    >();
    for (const containerId of new Set(containerIds)) {
      const months = (await index.getAll(
        IDBKeyRange.bound(
          ["month", containerId],
          ["month", containerId, []],
        ),
      )) as LedgerBalanceBucket[];
      const daily = (await index.getAll(
        IDBKeyRange.bound(["day", containerId], ["day", containerId, []]),
      )) as LedgerBalanceBucket[];
      byContainer.set(containerId, { months, days: daily });
    }
    await tx.done;

    return days.map((day) => {
      const month = day.slice(0, 7);
      let balance = 0;
      for (const containerId of containerIds) {
        const buckets = byContainer.get(containerId);
        if (!buckets) continue;
        for (const bucket of buckets.months) {
          if (bucket.key < month) balance += bucket.balanceDelta;
        }
        for (const bucket of buckets.days) {
          if (bucket.key.startsWith(month) && bucket.key <= day) {
            balance += bucket.balanceDelta;
          }
        }
      }
      return balance;
    });
  }

  async getPeriodCashFlow(
    containerIds: readonly string[],
    yearMonth: string,
  ): Promise<{ incoming: number; outgoing: number; net: number; count: number }> {
    const tx = this.db.transaction(STORE.ledgerBalanceBucket, "readonly");
    const store = tx.objectStore(STORE.ledgerBalanceBucket);
    let incoming = 0;
    let outgoing = 0;
    let count = 0;
    for (const containerId of new Set(containerIds)) {
      const bucket = (await store.get(
        `month:${yearMonth}:${containerId}`,
      )) as LedgerBalanceBucket | undefined;
      incoming += bucket?.ordinaryIn ?? 0;
      outgoing += bucket?.ordinaryOut ?? 0;
      count += bucket?.ordinaryCount ?? 0;
    }
    await tx.done;
    return { incoming, outgoing, net: incoming - outgoing, count };
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

      await this.rebuildLedgerReadModel(
        tx as IDBPTransaction<unknown, StoreName[], "readwrite">,
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
  async applyRemoteOps(remoteOps: Op[]): Promise<boolean> {
    // Which pulled ops are genuinely new? A steady-state sync re-sees only ops
    // already journaled, so this is empty and we skip the rebuild entirely — the
    // common tick costs one oplog read, not a full clear+replay. Done OUTSIDE the
    // idb transaction (the validation probe below awaits non-idb work, which would
    // auto-close a live tx); a concurrent local `dispatch` only ADDS this device's
    // own already-applied op, so deciding "new" here can't miss a remote change.
    const existing = new Set((await this.listOps()).map((o) => o.id));
    const candidates = remoteOps.filter((o) => !existing.has(o.id));
    if (candidates.length === 0) return false;

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
    if (applicable.length === 0) return false;

    const startedAt = Date.now();
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
      await this.rebuildLedgerReadModel(
        tx as IDBPTransaction<unknown, StoreName[], "readwrite">,
      );
      await tx.done;
      this.diagnostic({
        message: "database rebuild succeeded",
        facts: {
          received: remoteOps.length,
          applied: applicable.length,
          journal: all.length,
          durationMs: elapsed(startedAt),
        },
      });
      return true;
    } catch (err) {
      try {
        tx.abort();
      } catch {
        // already settled
      }
      await tx.done.catch(() => {});
      this.diagnostic({
        message: "database rebuild failed",
        facts: {
          received: remoteOps.length,
          applied: applicable.length,
          durationMs: elapsed(startedAt),
        },
      });
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
