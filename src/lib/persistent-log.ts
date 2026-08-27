import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { redactRecord, type LogRecord } from "./log-buffer";

export const MAX_LOG_RECORDS = 2_000;
export const MAX_LOG_AGE_MS = 14 * 24 * 60 * 60 * 1_000;
const DEFAULT_DATABASE_NAME = "yaccount-diagnostics";
const STORE_NAME = "records";
const BY_TIME = "by-at";
const DEFAULT_DELAY_MS = 100;

interface DiagnosticsDb extends DBSchema {
  records: {
    key: number;
    value: LogRecord;
    indexes: { "by-at": string };
  };
}

export interface LogStore {
  appendAndPrune(records: LogRecord[], nowMs: number): Promise<void>;
  readAll(): Promise<LogRecord[]>;
  clear(): Promise<void>;
}

/** Independent from the financial database so its failure trail remains readable. */
export class IndexedDbLogStore implements LogStore {
  private db: IDBPDatabase<DiagnosticsDb> | undefined;
  private opening: Promise<IDBPDatabase<DiagnosticsDb>> | undefined;

  constructor(private readonly name = DEFAULT_DATABASE_NAME) {}

  private async open(): Promise<IDBPDatabase<DiagnosticsDb>> {
    if (this.db) return this.db;
    if (typeof indexedDB === "undefined") {
      throw new Error("IndexedDB is unavailable");
    }
    this.opening ??= openDB<DiagnosticsDb>(this.name, 1, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { autoIncrement: true });
        store.createIndex(BY_TIME, "at");
      },
      blocking(_currentVersion, _blockedVersion, event) {
        (event.target as IDBDatabase | null)?.close();
      },
    });
    this.db = await this.opening;
    return this.db;
  }

  async appendAndPrune(records: LogRecord[], nowMs: number): Promise<void> {
    if (records.length === 0) return;
    const db = await this.open();
    const tx = db.transaction(STORE_NAME, "readwrite");
    for (const record of records) await tx.store.add(record);

    const byTime = tx.store.index(BY_TIME);
    const cutoff = new Date(nowMs - MAX_LOG_AGE_MS).toISOString();
    let cursor = await byTime.openCursor(IDBKeyRange.upperBound(cutoff, true));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    let overflow = (await tx.store.count()) - MAX_LOG_RECORDS;
    cursor = overflow > 0 ? await byTime.openCursor() : null;
    while (cursor && overflow > 0) {
      await cursor.delete();
      overflow -= 1;
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  async readAll(): Promise<LogRecord[]> {
    return (await this.open()).getAllFromIndex(STORE_NAME, BY_TIME);
  }

  async clear(): Promise<void> {
    await (await this.open()).clear(STORE_NAME);
  }

  close(): void {
    this.db?.close();
    this.db = undefined;
    this.opening = undefined;
  }
}

interface WriterOptions {
  delayMs?: number;
  now?: () => number;
  maxPending?: number;
}

/** Synchronous enqueue; all IndexedDB work happens later and fails open. */
export class PersistentLogWriter {
  private readonly delayMs: number;
  private readonly now: () => number;
  private readonly maxPending: number;
  private pending: LogRecord[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing: Promise<void> | undefined;

  constructor(
    private readonly store: LogStore,
    options: WriterOptions = {},
  ) {
    this.delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
    this.now = options.now ?? Date.now;
    this.maxPending = options.maxPending ?? MAX_LOG_RECORDS;
  }

  enqueue(record: LogRecord): void {
    this.pending.push(redactRecord(record));
    if (this.pending.length > this.maxPending) {
      this.pending.splice(0, this.pending.length - this.maxPending);
    }
    if (this.timer === undefined) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush();
      }, this.delayMs);
    }
  }

  async flush(): Promise<void> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.writing) await this.writing;
    if (this.pending.length === 0) return;
    const batch = this.pending.splice(0);
    const writing = this.store.appendAndPrune(batch, this.now()).catch(() => {});
    this.writing = writing;
    await writing;
    if (this.writing === writing) this.writing = undefined;
    if (this.pending.length > 0) await this.flush();
  }

  async readAll(): Promise<LogRecord[]> {
    await this.flush();
    return this.store.readAll().catch(() => []);
  }

  async clear(): Promise<void> {
    this.pending = [];
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.writing) await this.writing;
    await this.store.clear().catch(() => {});
  }
}

export const persistentLog = new PersistentLogWriter(new IndexedDbLogStore());
