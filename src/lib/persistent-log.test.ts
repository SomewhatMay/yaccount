import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogRecord } from "./log-buffer";
import {
  IndexedDbLogStore,
  MAX_LOG_AGE_MS,
  MAX_LOG_RECORDS,
  PersistentLogWriter,
  type LogStore,
} from "./persistent-log";

const record = (message: string, at: number): LogRecord => ({
  at: new Date(at).toISOString(),
  level: "info",
  scope: "test",
  message,
});

const NOW = Date.parse("2026-08-27T08:00:00.000Z");

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("IndexedDbLogStore", () => {
  it("survives a new store instance", async () => {
    const first = new IndexedDbLogStore("diagnostics-persistence");
    await first.appendAndPrune([record("before reload", NOW)], NOW);
    first.close();

    const reopened = new IndexedDbLogStore("diagnostics-persistence");
    expect((await reopened.readAll()).map((entry) => entry.message)).toEqual([
      "before reload",
    ]);
    reopened.close();
  });

  it("prunes records older than 14 days and keeps the boundary", async () => {
    const store = new IndexedDbLogStore("diagnostics-age");
    await store.appendAndPrune(
      [
        record("too old", NOW - MAX_LOG_AGE_MS - 1),
        record("boundary", NOW - MAX_LOG_AGE_MS),
        record("recent", NOW),
      ],
      NOW,
    );

    expect((await store.readAll()).map((entry) => entry.message)).toEqual([
      "boundary",
      "recent",
    ]);
    store.close();
  });

  it("keeps only the newest 2,000 records", async () => {
    const store = new IndexedDbLogStore("diagnostics-count");
    const records = Array.from({ length: MAX_LOG_RECORDS + 5 }, (_, index) =>
      record(`record ${index}`, NOW + index),
    );
    await store.appendAndPrune(records, NOW + records.length);

    const saved = await store.readAll();
    expect(saved).toHaveLength(MAX_LOG_RECORDS);
    expect(saved[0].message).toBe("record 5");
    expect(saved.at(-1)?.message).toBe(`record ${MAX_LOG_RECORDS + 4}`);
    store.close();
  });
});

describe("PersistentLogWriter", () => {
  it("redacts before persistence", async () => {
    const store = new IndexedDbLogStore("diagnostics-redaction");
    const writer = new PersistentLogWriter(store, { now: () => NOW });
    writer.enqueue({
      ...record("signed in as private@example.com", NOW),
      detail: "Bearer secret-value",
    });
    await writer.flush();

    const text = JSON.stringify(await store.readAll());
    expect(text).not.toContain("private@example.com");
    expect(text).not.toContain("secret-value");
    expect(text).toContain("[redacted");
    store.close();
  });

  it("does no storage work on the interaction path and batches a burst", async () => {
    vi.useFakeTimers();
    const appendAndPrune = vi.fn<LogStore["appendAndPrune"]>().mockResolvedValue();
    const store: LogStore = {
      appendAndPrune,
      readAll: vi.fn().mockResolvedValue([]),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const writer = new PersistentLogWriter(store, { delayMs: 100, now: () => NOW });

    for (let index = 0; index < 1_000; index += 1) {
      writer.enqueue(record(`operation ${index}`, NOW + index));
    }
    expect(appendAndPrune).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(appendAndPrune).toHaveBeenCalledTimes(1);
    expect(appendAndPrune.mock.calls[0][0]).toHaveLength(1_000);
  });

  it("bounds a logging storm before its first flush", async () => {
    const appendAndPrune = vi.fn<LogStore["appendAndPrune"]>().mockResolvedValue();
    const writer = new PersistentLogWriter(
      {
        appendAndPrune,
        readAll: vi.fn().mockResolvedValue([]),
        clear: vi.fn().mockResolvedValue(undefined),
      },
      { now: () => NOW },
    );
    for (let index = 0; index < MAX_LOG_RECORDS + 5; index += 1) {
      writer.enqueue(record(`operation ${index}`, NOW + index));
    }

    await writer.flush();
    expect(appendAndPrune.mock.calls[0][0]).toHaveLength(MAX_LOG_RECORDS);
    expect(appendAndPrune.mock.calls[0][0][0].message).toBe("operation 5");
  });

  it("swallows storage open, write, read, and clear failures", async () => {
    const failure = new Error("diagnostics storage unavailable");
    const writer = new PersistentLogWriter({
      appendAndPrune: vi.fn().mockRejectedValue(failure),
      readAll: vi.fn().mockRejectedValue(failure),
      clear: vi.fn().mockRejectedValue(failure),
    });

    expect(() => writer.enqueue(record("financial write failed", NOW))).not.toThrow();
    await expect(writer.flush()).resolves.toBeUndefined();
    await expect(writer.readAll()).resolves.toEqual([]);
    await expect(writer.clear()).resolves.toBeUndefined();
  });
});
