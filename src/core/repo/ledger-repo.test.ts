import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import {
  makeTemplate,
  makeTransaction,
  makeTransfer,
  makeVoidRow,
  type Transaction,
} from "@/core/model";
import { sortRegister } from "@/core/engine/ledger";
import type { TransactionFilter } from "@/core/engine/filter";
import type { Op } from "@/core/oplog";
import { Repo } from "./repo";
import { DB_VERSION, INDEX, STORE } from "./db";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

const at = (second: number): string =>
  new Date(Date.UTC(2026, 7, 20, 10, 0, second)).toISOString();

function rows(): Transaction[] {
  return [
    makeTransaction({
      id: "a",
      date: "2026-08-20",
      amount: -500,
      entered_at: at(1),
      vendor_source: "Coffee",
      category_id: "food",
    }),
    makeTransaction({
      id: "aa",
      date: "2026-08-20",
      amount: 500,
      entered_at: at(2),
      vendor_source: "Paycheck",
      category_id: "income",
    }),
    makeTransaction({
      id: "b",
      date: "2026-08-21",
      amount: -100,
      entered_at: at(3),
      vendor_source: "Bus",
      category_id: "travel",
    }),
    makeTransaction({
      id: "c",
      date: "2026-08-19",
      amount: -900,
      entered_at: null,
      vendor_source: "Groceries",
      category_id: "food",
    }),
  ];
}

function createOps(transactions: Transaction[]): Op[] {
  return transactions.map((row, index) => ({
    id: `op-${row.id}`,
    ts: at(index),
    type: "transaction.create" as const,
    payload: { row },
  }));
}

async function seedV4(name: string, transaction: Record<string, unknown>): Promise<void> {
  const stores = [
    "categories",
    "containers",
    "budget_targets",
    "transactions",
    "container_snapshots",
    "recurring_rules",
    "goals",
    "craving_wins",
    "settings",
    "oplog",
    "app_meta",
    "outbox",
  ];
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 4);
    request.onupgradeneeded = () => {
      for (const store of stores) {
        request.result.createObjectStore(store, {
          keyPath: store === "settings" || store === "app_meta" ? "key" : "id",
        });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(["transactions", "app_meta"], "readwrite");
      tx.objectStore("transactions").put(transaction);
      tx.objectStore("app_meta").put({ key: "deviceId", value: "v4-device" });
      tx.objectStore("app_meta").put({
        key: "migration:entered_at",
        value: "done",
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

describe("Repo Ledger read model", () => {
  it("opens additive v5 read stores and required indexes", async () => {
    expect(DB_VERSION).toBe(5);
    const repo = await Repo.open("paging-schema");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("paging-schema");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    expect([...db.objectStoreNames]).toEqual(
      expect.arrayContaining([
        STORE.entryRead,
        STORE.ledgerBalanceBucket,
        STORE.ledgerReadFact,
      ]),
    );
    const tx = db.transaction([STORE.transactions, STORE.entryRead], "readonly");
    expect([...tx.objectStore(STORE.transactions).indexNames]).toEqual(
      expect.arrayContaining([INDEX.transactionsByDate, INDEX.transactionsByReversesId]),
    );
    expect([...tx.objectStore(STORE.entryRead).indexNames]).toEqual(
      expect.arrayContaining([
        INDEX.entryChronology,
        INDEX.entryLargest,
        INDEX.entrySmallest,
      ]),
    );
    db.close();
    repo.close();
  });

  it("leaves canonical v4 rows and marker untouched when first read build fails", async () => {
    const invalid = {
      ...rows()[0],
      amount: 1n,
    };
    await seedV4("paging-failed-build", invalid);

    await expect(Repo.open("paging-failed-build")).rejects.toThrow();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("paging-failed-build");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const inspect = db.transaction([STORE.transactions, STORE.appMeta], "readonly");
    expect((await new Promise((resolve, reject) => {
      const request = inspect.objectStore(STORE.transactions).get("a");
      request.onsuccess = () => resolve(request.result.amount);
      request.onerror = () => reject(request.error);
    }))).toBe(1n);
    expect(
      await new Promise((resolve, reject) => {
        const request = inspect.objectStore(STORE.appMeta).get("ledgerRead:version");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
    ).toBeUndefined();

    const repair = db.transaction(STORE.transactions, "readwrite");
    repair.objectStore(STORE.transactions).put(rows()[0]);
    await new Promise<void>((resolve, reject) => {
      repair.oncomplete = () => resolve();
      repair.onerror = () => reject(repair.error);
    });
    db.close();
    const recovered = await Repo.open("paging-failed-build");
    expect(
      (await recovered.getLedgerPage({ sort: "newest", limit: 25, cursor: null })).rows
        .map((row) => row.id),
    ).toContain("a");
    recovered.close();
  });

  it("does not reread all canonical transactions on a normal reopen", async () => {
    const first = await Repo.open("paging-reopen");
    await first.resetTo(createOps(rows()));
    first.close();
    const getAll = vi.spyOn(IDBObjectStore.prototype, "getAll");

    const reopened = await Repo.open("paging-reopen");

    expect(
      getAll.mock.instances.filter(
        (store) => (store as IDBObjectStore).name === STORE.transactions,
      ),
    ).toEqual([]);
    getAll.mockRestore();
    reopened.close();
  });

  it("pages all four sorts with exact cursor concatenation", async () => {
    const repo = await Repo.open("paging-sorts");
    const transactions = rows();
    await repo.resetTo(createOps(transactions));

    for (const sort of ["newest", "oldest", "largest", "smallest"] as const) {
      const actual: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await repo.getLedgerPage({ sort, limit: 2, cursor });
        actual.push(...page.rows.map((row) => row.id));
        cursor = page.cursor;
        if (page.complete) expect(cursor).toBeNull();
      } while (cursor !== null);

      expect(actual, sort).toEqual(sortRegister(transactions, sort).map((row) => row.id));
    }
    repo.close();
  });

  it("filters exhaustively beyond rejected early cursor rows", async () => {
    const repo = await Repo.open("paging-filter");
    const transactions = [
      ...rows(),
      ...Array.from({ length: 30 }, (_, index) =>
        makeTransaction({
          id: `noise-${String(index).padStart(2, "0")}`,
          date: "2026-08-22",
          amount: -100,
          entered_at: at(index),
          vendor_source: "Noise",
          category_id: "other",
        }),
      ),
    ];
    await repo.resetTo(createOps(transactions));
    const filter: TransactionFilter = { text: "groceries" };

    const page = await repo.getLedgerPage({
      sort: "newest",
      limit: 25,
      cursor: null,
      filter,
    });

    expect(page.rows.map((row) => row.id)).toEqual(["c"]);
    expect(page.complete).toBe(true);
    expect(page.cursor).toBeNull();
    repo.close();
  });

  it("yields bounded provisional filter chunks without early definitive empty", async () => {
    const repo = await Repo.open("paging-progressive-filter");
    const transactions = [
      makeTransaction({
        id: "last-match",
        date: "2026-08-01",
        amount: -900,
        entered_at: at(1),
        vendor_source: "Needle",
        category_id: "food",
      }),
      ...Array.from({ length: 24 }, (_, index) =>
        makeTransaction({
          id: `newer-noise-${String(index).padStart(2, "0")}`,
          date: "2026-08-22",
          amount: -100,
          entered_at: at(index),
          vendor_source: "Noise",
          category_id: "other",
        }),
      ),
    ];
    await repo.resetTo(createOps(transactions));

    const found: string[] = [];
    let cursor: string | null = null;
    let chunks = 0;
    do {
      const chunk = await repo.scanLedgerEntries({
        sort: "newest",
        candidateLimit: 10,
        cursor,
        filter: { text: "needle" },
      });
      chunks += 1;
      found.push(...chunk.rows.map((row) => row.id));
      if (chunks < 3) {
        expect(chunk.rows).toEqual([]);
        expect(chunk.complete).toBe(false);
        expect(chunk.cursor).not.toBeNull();
      }
      cursor = chunk.cursor;
    } while (cursor !== null);

    expect(chunks).toBe(3);
    expect(found).toEqual(["last-match"]);
    repo.close();
  });

  it("stops a scan at its match limit without skipping later matches", async () => {
    const repo = await Repo.open("paging-progressive-match-limit");
    await repo.resetTo(
      createOps(
        ["one", "two", "three"].map((id, index) =>
          makeTransaction({
            id,
            date: "2026-08-20",
            amount: -100,
            entered_at: at(index),
            vendor_source: `Match ${id}`,
            category_id: "food",
          }),
        ),
      ),
    );

    const found: string[] = [];
    let cursor: string | null = null;
    let chunks = 0;
    do {
      const chunk = await repo.scanLedgerEntries({
        sort: "newest",
        candidateLimit: 10,
        matchLimit: 1,
        cursor,
        filter: { text: "match" },
      });
      chunks += 1;
      expect(chunk.rows).toHaveLength(1);
      found.push(...chunk.rows.map((row) => row.id));
      cursor = chunk.cursor;
    } while (cursor !== null);

    expect(chunks).toBe(3);
    expect(found).toEqual(["three", "two", "one"]);
    repo.close();
  });

  it("reads complete active date ranges and revalidates ids without full scans", async () => {
    const repo = await Repo.open("paging-selectors");
    const transactions = rows();
    await repo.resetTo(createOps(transactions));

    expect(
      (await repo.getLedgerRange("2026-08-20", "2026-08-20")).map((row) => row.id),
    ).toEqual(["a", "aa"]);
    expect(
      (await repo.getLedgerEntriesById(["missing", "c", "a"])).map((row) => row.id),
    ).toEqual(["c", "a"]);
    repo.close();
  });

  it("reads bounded reversal-inclusive approved ranges for cash forecasts", async () => {
    const repo = await Repo.open("paging-approved-range");
    const original = rows()[0];
    const reversal = makeVoidRow(original, { id: "void-a", on: "2026-08-22" });
    await repo.resetTo([
      ...createOps([original]),
      {
        id: "op-void-a",
        ts: at(20),
        type: "transaction.void",
        payload: { row: reversal },
      },
    ]);

    expect(
      (await repo.getApprovedTransactionRange("2026-08-20", "2026-08-22")).map(
        (row) => row.id,
      ),
    ).toEqual([original.id, reversal.id]);
    repo.close();
  });

  it("commits transaction mutation, liveness, balances, and revision together", async () => {
    const repo = await Repo.open("paging-dispatch");
    const original = rows()[0];
    await repo.dispatch(createOps([original])[0]);
    const first = await repo.getLedgerPage({ sort: "newest", limit: 25, cursor: null });
    const balanceBefore = await repo.getContainerFact("general");

    const reversal = makeVoidRow(original, { id: "void-a", on: "2026-08-22" });
    await repo.dispatch({
      id: "op-void-a",
      ts: at(20),
      type: "transaction.void",
      payload: { row: reversal },
    });
    const second = await repo.getLedgerPage({ sort: "newest", limit: 25, cursor: null });
    const balanceAfter = await repo.getContainerFact("general");

    expect(first.rows.map((row) => row.id)).toEqual(["a"]);
    expect(balanceBefore?.balance).toBe(-500);
    expect(second.rows).toEqual([]);
    expect(second.revision).toBeGreaterThan(first.revision);
    expect(balanceAfter?.balance).toBe(0);
    repo.close();
  });

  it("updates a local transaction without a full canonical transaction read", async () => {
    const repo = await Repo.open("paging-incremental");
    await repo.resetTo(createOps(rows()));
    const getAll = vi.spyOn(IDBObjectStore.prototype, "getAll");

    await repo.dispatch(
      createOps([
        makeTransaction({
          id: "incremental",
          date: "2026-08-23",
          amount: -700,
          entered_at: at(40),
          vendor_source: "Incremental",
          category_id: "food",
        }),
      ])[0],
    );

    expect(
      getAll.mock.instances.filter(
        (store) => (store as IDBObjectStore).name === STORE.transactions,
      ),
    ).toEqual([]);
    getAll.mockRestore();
    repo.close();
  });

  it("repairs compact usage count/latest when the latest entry is voided", async () => {
    const repo = await Repo.open("paging-usage-repair");
    const older = makeTransaction({
      id: "usage-older",
      date: "2026-08-20",
      amount: -500,
      entered_at: at(1),
      vendor_source: "Cafe",
      category_id: "food",
    });
    const newer = makeTransaction({
      id: "usage-newer",
      date: "2026-08-21",
      amount: -600,
      entered_at: at(2),
      vendor_source: "Cafe",
      category_id: "food",
    });
    await repo.resetTo(createOps([older, newer]));
    const before = await repo.getUsageFacts();
    const reversal = makeVoidRow(newer, { id: "usage-void", on: "2026-08-22" });
    await repo.dispatch({
      id: "op-usage-void",
      ts: at(3),
      type: "transaction.void",
      payload: { row: reversal },
    });
    const after = await repo.getUsageFacts();

    expect(before.find((fact) => fact.id === "usage:category:food")).toMatchObject({
      count: 2,
      recent: newer.entered_at,
    });
    expect(after.find((fact) => fact.id === "usage:category:food")).toMatchObject({
      count: 1,
      recent: older.entered_at,
    });
    repo.close();
  });

  it("recovers a stale cursor after an insert ahead without duplicates", async () => {
    const repo = await Repo.open("paging-stale-cursor");
    const transactions = rows();
    await repo.resetTo(createOps(transactions));
    const first = await repo.getLedgerPage({ sort: "newest", limit: 2, cursor: null });
    const inserted = makeTransaction({
      id: "new-ahead",
      date: "2026-08-23",
      amount: -700,
      entered_at: at(40),
      vendor_source: "New",
      category_id: "food",
    });
    await repo.dispatch(createOps([inserted])[0]);

    const next = await repo.getLedgerPage({
      sort: "newest",
      limit: 2,
      cursor: first.cursor,
    });

    expect(next.staleCursor).toBe(true);
    expect([...first.rows, ...next.rows].map((row) => row.id)).toEqual(
      sortRegister(transactions, "newest").map((row) => row.id),
    );
    repo.close();
  });

  it("fetches an unloaded focus row in a bounded centered window", async () => {
    const repo = await Repo.open("paging-focus");
    const transactions = Array.from({ length: 101 }, (_, index) =>
      makeTransaction({
        id: `row-${String(index).padStart(3, "0")}`,
        date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
        amount: -(index + 1),
        entered_at: at(index),
        vendor_source: `Row ${index}`,
        category_id: "food",
      }),
    );
    await repo.resetTo(createOps(transactions));

    const focus = await repo.getLedgerFocus({
      id: "row-050",
      sort: "newest",
      limit: 25,
    });

    expect(focus.rows).toHaveLength(25);
    expect(focus.rows.map((row) => row.id)).toContain("row-050");
    expect(focus.rows.findIndex((row) => row.id === "row-050")).toBeGreaterThan(0);
    expect(focus.rows.findIndex((row) => row.id === "row-050")).toBeLessThan(24);
    expect(focus.cursor).toEqual(expect.any(String));
    repo.close();
  });

  it("returns complete pending/templates separately from live Ledger rows", async () => {
    const repo = await Repo.open("paging-states");
    const approved = rows()[0];
    const pending = { ...rows()[1], inbox_status: "pending" as const };
    const template = makeTemplate({
      id: "template",
      template_name: "Coffee",
      amount: -500,
      vendor_source: "Coffee",
      container_id: "general",
      category_id: "food",
    });
    await repo.resetTo(createOps([approved, pending, template]));

    expect(await repo.count(STORE.transactions)).toBe(3);

    expect((await repo.getEntryCollection("ledger")).map((row) => row.id)).toEqual([
      approved.id,
    ]);
    expect((await repo.getEntryCollection("pending")).map((row) => row.id)).toEqual([
      pending.id,
    ]);
    expect((await repo.getEntryCollection("template")).map((row) => row.id)).toEqual([
      template.id,
    ]);
    repo.close();
  });

  it("scans every findable entry state in bounded Search chunks", async () => {
    const repo = await Repo.open("paging-search-scan");
    const approved = rows()[0];
    const pending = { ...rows()[1], inbox_status: "pending" as const };
    const template = makeTemplate({
      id: "template",
      template_name: "Coffee",
      amount: -500,
      vendor_source: "Coffee",
      container_id: "general",
      category_id: "food",
    });
    await repo.resetTo(createOps([approved, pending, template]));

    const ids: string[] = [];
    let cursor: string | null = null;
    let chunks = 0;
    do {
      const chunk = await repo.scanSearchEntries({ candidateLimit: 2, cursor });
      chunks += 1;
      expect(chunk.rows.length).toBeLessThanOrEqual(2);
      ids.push(...chunk.rows.map((row) => row.id));
      cursor = chunk.cursor;
    } while (cursor !== null);

    expect(chunks).toBe(2);
    expect(ids.sort()).toEqual([approved.id, pending.id, template.id].sort());
    repo.close();
  });

  it("computes exact carried balances from compact buckets, including reversals", async () => {
    const repo = await Repo.open("paging-carried");
    const original = makeTransaction({
      id: "original",
      date: "2026-06-30",
      amount: 10_000,
      entered_at: at(1),
      vendor_source: "Opening",
      category_id: "income",
    });
    const spend = makeTransaction({
      id: "spend",
      date: "2026-07-02",
      amount: -2_500,
      entered_at: at(2),
      vendor_source: "Spend",
      category_id: "food",
    });
    const reversal = makeVoidRow(spend, { id: "void-spend", on: "2026-07-04" });
    await repo.resetTo(createOps([original, spend, reversal]));

    expect(
      await repo.getOverallBalanceSeries(
        ["general"],
        ["2026-06-29", "2026-06-30", "2026-07-02", "2026-07-04"],
      ),
    ).toEqual([0, 10_000, 7_500, 10_000]);
    expect(await repo.getPeriodCashFlow(["general"], "2026-07")).toEqual({
      incoming: 2_500,
      outgoing: 2_500,
      net: 0,
      count: 2,
    });
    repo.close();
  });

  it("sums exact net transfers for a container from a goal cycle date", async () => {
    const repo = await Repo.open("paging-goal-contribution");
    const before = makeTransfer({
      id: "before",
      date: "2025-12-31",
      amount: 1000,
      container_id: "general",
      to_container_id: "goal",
      fromName: "General",
      toName: "Goal",
    });
    const incoming = makeTransfer({
      id: "incoming",
      date: "2026-01-05",
      amount: 5000,
      container_id: "general",
      to_container_id: "goal",
      fromName: "General",
      toName: "Goal",
    });
    const outgoing = makeTransfer({
      id: "outgoing",
      date: "2026-02-05",
      amount: 1200,
      container_id: "goal",
      to_container_id: "general",
      fromName: "Goal",
      toName: "General",
    });
    await repo.resetTo(createOps([before, incoming, outgoing]));

    expect(await repo.getContainerTransferContribution("goal", "2026-01-01")).toBe(
      3800,
    );
    repo.close();
  });

  it("converges pages and facts after shuffled remote arrival", async () => {
    const left = await Repo.open("paging-converge-left");
    const right = await Repo.open("paging-converge-right");
    const ops = createOps(rows());
    await left.applyRemoteOps([...ops].reverse());
    await right.applyRemoteOps([ops[1], ops[3], ops[0], ops[2]]);

    for (const sort of ["newest", "oldest", "largest", "smallest"] as const) {
      expect(
        (await left.getLedgerPage({ sort, limit: 50, cursor: null })).rows,
      ).toEqual((await right.getLedgerPage({ sort, limit: 50, cursor: null })).rows);
    }
    expect(await left.getLedgerReadSnapshot()).toEqual(
      await right.getLedgerReadSnapshot(),
    );
    left.close();
    right.close();
  });

  it("reset clears obsolete projections and rebuilds exact empty facts", async () => {
    const repo = await Repo.open("paging-reset-projection");
    await repo.resetTo(createOps(rows()));
    expect((await repo.getLedgerReadSnapshot()).ledgerCount).toBe(4);

    await repo.resetTo([]);

    expect(await repo.getEntryCollection("ledger")).toEqual([]);
    expect((await repo.getLedgerReadSnapshot()).ledgerCount).toBe(0);
    expect(await repo.getContainerFact("general")).toBeUndefined();
    repo.close();
  });
});
