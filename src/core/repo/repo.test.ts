import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { Repo } from "@/core/repo";
import { STORE, openDb } from "@/core/repo/db";
import { replay, MemoryTx, type Op } from "@/core/oplog";
import {
  makeCategory,
  makeContainer,
  makeTransaction,
  GENERAL_CONTAINER_ID,
  type Category,
  type Container,
  type Transaction,
} from "@/core/model";

const at = (ms: number): string => new Date(ms).toISOString();

// Fresh IndexedDB per test (fake-indexeddb).
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("Repo — first-init seeding (§5.2)", () => {
  it("auto-creates the 'general' wallet, opted into overall balance", async () => {
    const repo = await Repo.open();
    const general = await repo.get<Container>(STORE.containers, GENERAL_CONTAINER_ID);
    expect(general).toBeDefined();
    expect(general!.include_in_overall_balance).toBe(true);
    expect(general!.is_archived).toBe(false);
  });

  it("mints a device-local deviceId (never written as an op)", async () => {
    const repo = await Repo.open();
    const deviceId = await repo.getDeviceId();
    expect(deviceId.length).toBeGreaterThan(0);
    // deviceId is NOT in the op-log — every op is a category/container mutation,
    // and the only seeded op is the 'general' container.
    const ops = await repo.listOps();
    expect(
      ops.every((o) => o.type.startsWith("category.") || o.type.startsWith("container.")),
    ).toBe(true);
    expect(ops.some((o) => o.type === "container.create")).toBe(true);
  });

  it("re-opening the same DB does not duplicate the seed op or change deviceId", async () => {
    const repo1 = await Repo.open();
    const id1 = await repo1.getDeviceId();
    const ops1 = await repo1.listOps();
    repo1.close();

    const repo2 = await Repo.open();
    const id2 = await repo2.getDeviceId();
    const ops2 = await repo2.listOps();
    expect(id2).toBe(id1);
    expect(ops2.length).toBe(ops1.length);
  });
});

describe("Repo — dispatch writes op-log + materialized state in one transaction", () => {
  it("dispatch applies the op to the table and records it in the oplog", async () => {
    const repo = await Repo.open();
    const row = makeCategory({ id: "c1", name: "Groceries", type: "expense" });
    await repo.dispatch({
      id: "op1",
      ts: at(1000),
      type: "category.create",
      payload: { row },
    });
    const cat = await repo.get<Category>(STORE.categories, "c1");
    expect(cat!.name).toBe("Groceries");
    const ops = await repo.listOps();
    expect(ops.some((o) => o.id === "op1")).toBe(true);
  });

  it("re-dispatching an op with the same id is a no-op (idempotent by id, §8.2)", async () => {
    const repo = await Repo.open();
    const op: Op = {
      id: "op1",
      ts: at(1000),
      type: "category.create",
      payload: { row: makeCategory({ id: "c1", name: "Groceries", type: "expense" }) },
    };
    await repo.dispatch(op);
    const before = await repo.listOps();
    await repo.dispatch(op);
    const after = await repo.listOps();
    expect(after.length).toBe(before.length);
  });

  it("listOps returns the log in total order (ts, then id)", async () => {
    const repo = await Repo.open();
    await repo.dispatch({
      id: "b",
      ts: at(2000),
      type: "container.create",
      payload: { row: makeContainer({ id: "k2", name: "K2" }) },
    });
    await repo.dispatch({
      id: "a",
      ts: at(1000),
      type: "container.create",
      payload: { row: makeContainer({ id: "k1", name: "K1" }) },
    });
    const userOps = (await repo.listOps()).filter((o) => o.id === "a" || o.id === "b");
    expect(userOps.map((o) => o.id)).toEqual(["a", "b"]);
  });
});

describe("Repo — replay equality (§3, testing strategy)", () => {
  it("rebuilding state by replaying the oplog equals the incrementally-applied state", async () => {
    const repo = await Repo.open();
    const ops: Op[] = [
      {
        id: "o1",
        ts: at(1000),
        type: "category.create",
        payload: { row: makeCategory({ id: "c1", name: "Groceries", type: "expense" }) },
      },
      {
        id: "o2",
        ts: at(2000),
        type: "container.create",
        payload: { row: makeContainer({ id: "v1", name: "Vacation" }) },
      },
      {
        id: "o3",
        ts: at(3000),
        type: "category.update",
        payload: { row: makeCategory({ id: "c1", name: "Food", type: "expense" }) },
      },
      { id: "o4", ts: at(4000), type: "category.archive", payload: { id: "c1" } },
    ];
    for (const op of ops) await repo.dispatch(op);

    // Incremental (live IndexedDB) state:
    const liveCats = await repo.getAll<Category>(STORE.categories);
    const liveConts = await repo.getAll<Container>(STORE.containers);

    // Replay all ops (incl. the seed) into a fresh in-memory state:
    const allOps = await repo.listOps();
    const rebuilt = await replay(allOps);
    const rtx = new MemoryTx(rebuilt);
    const replayCats = await rtx.getAll<Category>(STORE.categories);
    const replayConts = await rtx.getAll<Container>(STORE.containers);

    const byId = <T extends { id: string }>(xs: T[]) =>
      Object.fromEntries(xs.map((x) => [x.id, x]));
    expect(byId(replayCats)).toEqual(byId(liveCats));
    expect(byId(replayConts)).toEqual(byId(liveConts));
    expect(byId(liveCats)["c1"].name).toBe("Food");
    expect(byId(liveCats)["c1"].is_archived).toBe(true);
  });
});

describe("Repo.dispatch — the single-transaction guarantee (impl §3)", () => {
  it("does not journal an op whose apply fails (log and state never desync)", async () => {
    const repo = await Repo.open();
    const before = (await repo.listOps()).length;

    // An op type from a newer client, arriving via sync: the reducer's `never`
    // branch throws. The journal must not keep it, or replay would then throw
    // forever on this device.
    const rogue = {
      id: "op-rogue",
      ts: at(5000),
      type: "definitely.unknown",
      payload: { row: { id: "x" } },
    } as unknown as Op;

    await expect(repo.dispatch(rogue)).rejects.toThrow();
    const ops = await repo.listOps();
    expect(ops).toHaveLength(before);
    expect(ops.some((o) => o.id === "op-rogue")).toBe(false);
  });

  it("keeps working after a failed dispatch", async () => {
    const repo = await Repo.open();
    const rogue = {
      id: "op-rogue",
      ts: at(5000),
      type: "nope",
      payload: {},
    } as unknown as Op;
    await expect(repo.dispatch(rogue)).rejects.toThrow();

    await repo.dispatch({
      id: "op-ok",
      ts: at(6000),
      type: "category.create",
      payload: { row: makeCategory({ id: "c1", name: "Groceries", type: "expense" }) },
    });
    expect(await repo.get<Category>(STORE.categories, "c1")).toBeDefined();
  });
});

describe("Repo — schema upgrades never drop local data (§8.6 local-first)", () => {
  it("carries v1 rows across the v1 → v2 upgrade and adds the settings store", async () => {
    // Stand up a *version 1* database by hand: the M1/M2 store set, no `settings`.
    const V1_STORES = [
      "categories",
      "containers",
      "budget_targets",
      "transactions",
      "container_snapshots",
      "recurring_rules",
      "goals",
      "oplog",
      "app_meta",
    ];
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("yaccount", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of V1_STORES) {
          db.createObjectStore(name, { keyPath: name === "app_meta" ? "key" : "id" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["categories", "app_meta"], "readwrite");
        tx.objectStore("categories").put(
          makeCategory({ id: "c1", name: "Groceries", type: "expense" }),
        );
        tx.objectStore("app_meta").put({ key: "deviceId", value: "device-from-v1" });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const repo = await Repo.open(); // opens at DB_VERSION 2, guarded upgrade
    const survived = await repo.get<Category>(STORE.categories, "c1");
    expect(survived?.name).toBe("Groceries");
    expect(await repo.getDeviceId()).toBe("device-from-v1"); // identity preserved
    // The new store exists AND is writable — it is in ALL_STORES, so if the
    // upgrade missed it every dispatch would throw NotFoundError.
    await repo.dispatch({
      id: "op-setting",
      ts: at(7000),
      type: "setting.set",
      payload: { row: { key: "default_container_id", value: "general" } },
    });
    expect(await repo.getAll(STORE.settings)).toHaveLength(1);
  });
});

describe("Repo — seeding is deterministic and respects the user (§8.4)", () => {
  it("two fresh devices mint an identical seed op, payload included", async () => {
    const a = await Repo.open("yaccount-a");
    const b = await Repo.open("yaccount-b");
    const seedA = (await a.listOps()).find((o) => o.id === "seed:general");
    const seedB = (await b.listOps()).find((o) => o.id === "seed:general");
    // Same id AND same payload — dedupe by id must not hide a divergent wallet.
    expect(seedA).toEqual(seedB);
  });

  it("does not resurrect 'general' after the user archives it", async () => {
    const repo = await Repo.open();
    await repo.dispatch({
      id: "op-arch",
      ts: at(8000),
      type: "container.archive",
      payload: { id: GENERAL_CONTAINER_ID },
    });
    repo.close();

    const reopened = await Repo.open();
    const general = await reopened.get<Container>(STORE.containers, GENERAL_CONTAINER_ID);
    expect(general!.is_archived).toBe(true); // the user's deliberate act stands
    const seeds = (await reopened.listOps()).filter((o) => o.id === "seed:general");
    expect(seeds).toHaveLength(1);
  });

  it("orders equal-ts ops by id at the repo level (§8.2 tiebreak)", async () => {
    const repo = await Repo.open();
    const ts = at(9000);
    for (const id of ["op-z", "op-a"]) {
      await repo.dispatch({
        id,
        ts,
        type: "container.create",
        payload: { row: makeContainer({ id: `k-${id}`, name: id }) },
      });
    }
    const sameTs = (await repo.listOps()).filter((o) => o.ts === ts).map((o) => o.id);
    expect(sameTs).toEqual(["op-a", "op-z"]);
  });
});

describe("Repo — backfilling entered_at on rows that predate it (M11)", () => {
  // A pre-M11 row carries no instant, so the register can only tie-break it on a
  // random UUID. The journal already knows when it was written: the op's `ts`.
  // No DB_VERSION bump — IndexedDB records are schemaless, so this is a one-shot
  // data pass guarded by a marker, not a schema upgrade.
  const legacyRow = (id: string, date = "2026-07-20"): Record<string, unknown> => {
    const row = {
      ...makeTransaction({
        id,
        date,
        amount: -1000,
        vendor_source: id,
        category_id: "coffee",
      }),
    } as Record<string, unknown>;
    delete row.entered_at;
    return row;
  };

  async function seedLegacy(
    rows: Record<string, unknown>[],
    ops: { id: string; ts: string; rowId: string; type?: string }[],
  ): Promise<void> {
    const db = await openDb();
    for (const row of rows) await db.put(STORE.transactions, row);
    for (const o of ops) {
      await db.put(STORE.oplog, {
        id: o.id,
        ts: o.ts,
        type: o.type ?? "transaction.create",
        payload: { row: legacyRow(o.rowId) },
      });
    }
    db.close();
  }

  it("stamps a legacy row from the op that created it", async () => {
    await seedLegacy([legacyRow("t1")], [{ id: "op-t1", ts: at(1000), rowId: "t1" }]);
    const repo = await Repo.open();
    const stored = await repo.get<Transaction>(STORE.transactions, "t1");
    expect(stored!.entered_at).toBe(at(1000));
  });

  it("uses the EARLIEST op for the row, not a later edit", async () => {
    await seedLegacy(
      [legacyRow("t1")],
      [
        { id: "op-edit", ts: at(5000), rowId: "t1", type: "transaction.update" },
        { id: "op-t1", ts: at(1000), rowId: "t1" },
      ],
    );
    const repo = await Repo.open();
    const stored = await repo.get<Transaction>(STORE.transactions, "t1");
    expect(stored!.entered_at).toBe(at(1000)); // when it was written, not last touched
  });

  it("leaves a row whose creating op has been collapsed away as null (§8.4)", async () => {
    // After an op-log collapse the deep history lives in an archived Drive ledger,
    // so some rows genuinely have no op here. That must not throw or invent a time.
    await seedLegacy([legacyRow("orphan")], []);
    const repo = await Repo.open();
    const stored = await repo.get<Transaction>(STORE.transactions, "orphan");
    expect(stored).toBeDefined();
    expect(stored!.entered_at ?? null).toBeNull();
  });

  it("never overwrites an instant the row already carries", async () => {
    const own = "2026-07-20T09:00:00.000Z";
    const db = await openDb();
    await db.put(STORE.transactions, {
      ...makeTransaction({
        id: "t1",
        date: "2026-07-20",
        amount: -1000,
        vendor_source: "t1",
        category_id: "coffee",
        entered_at: own,
      }),
    });
    await db.put(STORE.oplog, {
      id: "op-t1",
      ts: at(1000),
      type: "transaction.create",
      payload: { row: legacyRow("t1") },
    });
    db.close();
    const repo = await Repo.open();
    const stored = await repo.get<Transaction>(STORE.transactions, "t1");
    expect(stored!.entered_at).toBe(own);
  });

  it("runs once — a second open is a no-op and does not rewrite rows", async () => {
    await seedLegacy([legacyRow("t1")], [{ id: "op-t1", ts: at(1000), rowId: "t1" }]);
    const first = await Repo.open();
    const afterFirst = await first.get<Transaction>(STORE.transactions, "t1");
    first.close();

    const second = await Repo.open();
    const afterSecond = await second.get<Transaction>(STORE.transactions, "t1");
    expect(afterSecond).toEqual(afterFirst);
  });

  it("does not disturb the op-log or any other table", async () => {
    await seedLegacy([legacyRow("t1")], [{ id: "op-t1", ts: at(1000), rowId: "t1" }]);
    const repo = await Repo.open();
    const ops = await repo.listOps();
    // the seeded create op + the 'general' seed op, unchanged in count
    expect(ops.filter((o) => o.id === "op-t1")).toHaveLength(1);
    expect(
      await repo.get<Container>(STORE.containers, GENERAL_CONTAINER_ID),
    ).toBeDefined();
  });
});
