import { describe, it, expect } from "vitest";
import { applyOp, MemoryTx, newMemoryState, replay, type Op } from "@/core/oplog";
import { STORE, STATE_STORES, type StoreName } from "@/core/repo/db";

const ALL_STATE_STORES: StoreName[] = STATE_STORES;
import {
  makeCategory,
  makeContainer,
  makeContainerSnapshot,
  makeTransaction,
  makeVoidRow,
  SETTING,
  type Category,
  type Container,
  type ContainerSnapshot,
  type Setting,
  type Transaction,
} from "@/core/model";

const at = (ms: number): string => new Date(ms).toISOString();

function opCreateCategory(id: string, name: string, ts: number): Op {
  const row = makeCategory({ id, name, type: "expense" });
  return { id: `op-${id}`, ts: at(ts), type: "category.create", payload: { row } };
}

async function readAll<T>(
  state: ReturnType<typeof newMemoryState>,
  store: StoreName,
): Promise<T[]> {
  const tx = new MemoryTx(state);
  return tx.getAll<T>(store);
}

describe("applyOp — category ops", () => {
  it("category.create materializes the row", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, opCreateCategory("c1", "Groceries", 1000));
    const rows = await readAll<Category>(state, STORE.categories);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Groceries");
  });

  it("category.update replaces the full row (entity-level LWW)", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, opCreateCategory("c1", "Groceries", 1000));
    const renamed: Category = {
      ...makeCategory({ id: "c1", name: "Food", type: "expense" }),
    };
    await applyOp(tx, {
      id: "op-rename",
      ts: at(2000),
      type: "category.update",
      payload: { row: renamed },
    });
    const rows = await readAll<Category>(state, STORE.categories);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Food");
  });

  it("category.archive soft-deletes (never removes the row)", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, opCreateCategory("c1", "Groceries", 1000));
    await applyOp(tx, {
      id: "op-arch",
      ts: at(2000),
      type: "category.archive",
      payload: { id: "c1" },
    });
    const rows = await readAll<Category>(state, STORE.categories);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_archived).toBe(true);
  });
});

describe("applyOp — container ops", () => {
  it("container.create + archive", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    const row = makeContainer({ id: "v1", name: "Vacation" });
    await applyOp(tx, {
      id: "o1",
      ts: at(1),
      type: "container.create",
      payload: { row },
    });
    await applyOp(tx, {
      id: "o2",
      ts: at(2),
      type: "container.archive",
      payload: { id: "v1" },
    });
    const rows = await readAll<Container>(state, STORE.containers);
    expect(rows[0].is_archived).toBe(true);
  });
});

describe("idempotency (§8.2) — replaying an op twice is a no-op", () => {
  it("applying the same op twice yields identical state", async () => {
    const once = newMemoryState();
    const twice = newMemoryState();
    const op = opCreateCategory("c1", "Groceries", 1000);
    const archive: Op = {
      id: "op-arch",
      ts: at(2000),
      type: "category.archive",
      payload: { id: "c1" },
    };

    const t1 = new MemoryTx(once);
    await applyOp(t1, op);
    await applyOp(t1, archive);

    const t2 = new MemoryTx(twice);
    await applyOp(t2, op);
    await applyOp(t2, op); // duplicate
    await applyOp(t2, archive);
    await applyOp(t2, archive); // duplicate

    expect(await readAll<Category>(twice, STORE.categories)).toEqual(
      await readAll<Category>(once, STORE.categories),
    );
  });
});

describe("replay — total order (ts, id) determinism (§8.2)", () => {
  it("replaying a shuffled op set converges to the same state as ordered application", async () => {
    const ops: Op[] = [
      opCreateCategory("c1", "Groceries", 1000),
      opCreateCategory("c2", "Rent", 1000), // same ts → id tiebreak
      {
        id: "op-c1-rename",
        ts: at(3000),
        type: "category.update",
        payload: { row: makeCategory({ id: "c1", name: "Food", type: "expense" }) },
      },
      { id: "op-c2-arch", ts: at(2000), type: "category.archive", payload: { id: "c2" } },
    ];

    const ordered = await replay(ops);
    const shuffled = await replay([ops[3], ops[1], ops[2], ops[0]]);

    const a = await new MemoryTx(ordered).getAll<Category>(STORE.categories);
    const b = await new MemoryTx(shuffled).getAll<Category>(STORE.categories);
    expect(b).toEqual(a);

    // and the applied end-state is correct
    const byId = Object.fromEntries(a.map((c) => [c.id, c]));
    expect(byId["c1"].name).toBe("Food");
    expect(byId["c2"].is_archived).toBe(true);
  });
});

describe("applyOp — container, snapshot & setting ops (M3)", () => {
  const container = (id: string, name: string): Op => ({
    id: `op-${id}`,
    ts: at(1000),
    type: "container.create",
    payload: { row: makeContainer({ id, name }) },
  });

  it("container.archive soft-deletes, leaving the row a valid FK target (§5.5)", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, container("k1", "Vacation"));
    await applyOp(tx, {
      id: "op-arch",
      ts: at(2000),
      type: "container.archive",
      payload: { id: "k1" },
    });
    const rows = await readAll<Container>(state, STORE.containers);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_archived).toBe(true);
  });

  it("snapshot.record materializes a container_snapshots row, idempotently (§5.6)", async () => {
    const op: Op = {
      id: "op-s1",
      ts: at(3000),
      type: "snapshot.record",
      payload: {
        row: makeContainerSnapshot({
          id: "s1",
          container_id: "brokerage",
          date: "2026-07-20",
          reported_balance: 500000,
        }),
      },
    };
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, op);
    await applyOp(tx, op); // replay
    const rows = await readAll<ContainerSnapshot>(state, STORE.containerSnapshots);
    expect(rows).toHaveLength(1);
    expect(rows[0].reported_balance).toBe(500000);
  });

  it("snapshots accumulate — a new report never overwrites the history", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    for (const [id, date, bal] of [
      ["s1", "2026-06-30", 480000],
      ["s2", "2026-07-31", 500000],
    ] as const) {
      await applyOp(tx, {
        id: `op-${id}`,
        ts: at(4000),
        type: "snapshot.record",
        payload: {
          row: makeContainerSnapshot({
            id,
            container_id: "brokerage",
            date,
            reported_balance: bal,
          }),
        },
      });
    }
    expect(
      await readAll<ContainerSnapshot>(state, STORE.containerSnapshots),
    ).toHaveLength(2);
  });

  it("setting.set upserts by key (last writer wins, synced like any op)", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    const set = (value: string, ts: number): Op => ({
      id: `op-set-${ts}`,
      ts: at(ts),
      type: "setting.set",
      payload: { row: { key: SETTING.defaultContainerId, value } },
    });
    await applyOp(tx, set("general", 5000));
    await applyOp(tx, set("vacation", 6000));
    const rows = await readAll<Setting>(state, STORE.settings);
    expect(rows).toEqual([{ key: SETTING.defaultContainerId, value: "vacation" }]);
  });
});

describe("applyOp — correcting a reported balance (snapshot.update / .remove)", () => {
  const recordOp = (id: string, date: string, bal: number, ts = 1000): Op => ({
    id: `op-${id}`,
    ts: at(ts),
    type: "snapshot.record",
    payload: {
      row: makeContainerSnapshot({
        id,
        container_id: "brokerage",
        date,
        reported_balance: bal,
      }),
    },
  });

  it("snapshot.update replaces the row (entity-LWW) — a typo is fixable", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, recordOp("s1", "2026-07-20", 50000000)); // fat-fingered
    await applyOp(tx, {
      id: "op-fix",
      ts: at(2000),
      type: "snapshot.update",
      payload: {
        row: makeContainerSnapshot({
          id: "s1",
          container_id: "brokerage",
          date: "2026-07-20",
          reported_balance: 500000,
        }),
      },
    });
    const rows = await readAll<ContainerSnapshot>(state, STORE.containerSnapshots);
    expect(rows).toHaveLength(1);
    expect(rows[0].reported_balance).toBe(500000);
  });

  it("snapshot.remove drops the row from state, idempotently", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, recordOp("s1", "2026-07-20", 500000));
    await applyOp(tx, recordOp("s2", "2026-06-30", 480000, 1500));
    const remove: Op = {
      id: "op-rm",
      ts: at(3000),
      type: "snapshot.remove",
      payload: { id: "s1" },
    };
    await applyOp(tx, remove);
    await applyOp(tx, remove); // replay
    const rows = await readAll<ContainerSnapshot>(state, STORE.containerSnapshots);
    expect(rows.map((r) => r.id)).toEqual(["s2"]);
  });

  it("replay converges no matter the order the ops arrive in (the delete is journaled)", async () => {
    const ops: Op[] = [
      recordOp("s1", "2026-07-20", 500000, 1000),
      { id: "op-rm", ts: at(3000), type: "snapshot.remove", payload: { id: "s1" } },
      recordOp("s2", "2026-06-30", 480000, 2000),
    ];
    const ordered = await replay(ops);
    const shuffled = await replay([ops[1], ops[2], ops[0]]);
    const a = await new MemoryTx(ordered).getAll<ContainerSnapshot>(
      STORE.containerSnapshots,
    );
    const b = await new MemoryTx(shuffled).getAll<ContainerSnapshot>(
      STORE.containerSnapshots,
    );
    expect(b).toEqual(a);
    expect(a.map((r) => r.id)).toEqual(["s2"]); // the removal wins on ts order
  });
});

describe("applyOp — one report per container per day (§5.6, upsert by natural key)", () => {
  const record = (
    id: string,
    date: string,
    bal: number,
    ts: number,
    container = "brokerage",
  ): Op => ({
    id: `op-${id}`,
    ts: at(ts),
    type: "snapshot.record",
    payload: {
      row: makeContainerSnapshot({
        id,
        container_id: container,
        date,
        reported_balance: bal,
      }),
    },
  });

  it("a second report for the same day replaces the first", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, record("s1", "2026-07-20", 500000, 1000));
    await applyOp(tx, record("s2", "2026-07-20", 512300, 2000));
    const rows = await readAll<ContainerSnapshot>(state, STORE.containerSnapshots);
    expect(rows).toHaveLength(1);
    expect(rows[0].reported_balance).toBe(512300);
  });

  it("keeps same-day reports for DIFFERENT containers", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, record("s1", "2026-07-20", 500000, 1000, "brokerage"));
    await applyOp(tx, record("s2", "2026-07-20", 250000, 2000, "tfsa"));
    const rows = await readAll<ContainerSnapshot>(state, STORE.containerSnapshots);
    expect(rows).toHaveLength(2);
  });

  it("editing a report onto a day that already has one collapses them", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, record("s1", "2026-07-20", 500000, 1000));
    await applyOp(tx, record("s2", "2026-06-30", 480000, 2000));
    await applyOp(tx, {
      id: "op-move",
      ts: at(3000),
      type: "snapshot.update",
      payload: {
        row: makeContainerSnapshot({
          id: "s2",
          container_id: "brokerage",
          date: "2026-07-20", // moved onto s1's day
          reported_balance: 481000,
        }),
      },
    });
    const rows = await readAll<ContainerSnapshot>(state, STORE.containerSnapshots);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("s2");
    expect(rows[0].reported_balance).toBe(481000);
  });

  it("converges regardless of arrival order — two devices logging the same day", async () => {
    const ops: Op[] = [
      record("s1", "2026-07-20", 500000, 1000),
      record("s2", "2026-07-20", 512300, 2000),
    ];
    const a = await new MemoryTx(await replay(ops)).getAll<ContainerSnapshot>(
      STORE.containerSnapshots,
    );
    const b = await new MemoryTx(
      await replay([ops[1], ops[0]]),
    ).getAll<ContainerSnapshot>(STORE.containerSnapshots);
    expect(b).toEqual(a);
    expect(a).toHaveLength(1);
    expect(a[0].id).toBe("s2"); // the later op in the total order wins
  });

  it("re-applying the winning op is still a no-op (idempotent)", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    const second = record("s2", "2026-07-20", 512300, 2000);
    await applyOp(tx, record("s1", "2026-07-20", 500000, 1000));
    await applyOp(tx, second);
    await applyOp(tx, second);
    expect(
      await readAll<ContainerSnapshot>(state, STORE.containerSnapshots),
    ).toHaveLength(1);
  });
});

describe("applyOp — archiving is REVERSIBLE (undo is first-class)", () => {
  it("category.unarchive puts the row back in play", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, opCreateCategory("c1", "Groceries", 1000));
    await applyOp(tx, {
      id: "op-arch",
      ts: at(2000),
      type: "category.archive",
      payload: { id: "c1" },
    });
    const unarchive: Op = {
      id: "op-un",
      ts: at(3000),
      type: "category.unarchive",
      payload: { id: "c1" },
    };
    await applyOp(tx, unarchive);
    await applyOp(tx, unarchive); // replay
    const rows = await readAll<Category>(state, STORE.categories);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_archived).toBe(false);
  });

  it("container.unarchive restores it, and the round trip is lossless", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    const row = makeContainer({ id: "k1", name: "Vacation" });
    await applyOp(tx, {
      id: "op-k1",
      ts: at(1000),
      type: "container.create",
      payload: { row },
    });
    await applyOp(tx, {
      id: "op-arch",
      ts: at(2000),
      type: "container.archive",
      payload: { id: "k1" },
    });
    await applyOp(tx, {
      id: "op-un",
      ts: at(3000),
      type: "container.unarchive",
      payload: { id: "k1" },
    });
    const rows = await readAll<Container>(state, STORE.containers);
    expect(rows[0]).toEqual(row); // every other field untouched
  });

  it("unarchiving something that was never archived is a no-op", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, opCreateCategory("c1", "Groceries", 1000));
    await applyOp(tx, {
      id: "op-un",
      ts: at(2000),
      type: "category.unarchive",
      payload: { id: "c1" },
    });
    expect((await readAll<Category>(state, STORE.categories))[0].is_archived).toBe(false);
  });
});

describe("applyOp — transaction ops (the ledger spine, §5.4/§0.3)", () => {
  const row = makeTransaction({
    id: "t1",
    date: "2026-07-20",
    amount: -1000,
    vendor_source: "Starbucks",
    category_id: "coffee",
  });
  const create: Op = {
    id: "op-t1",
    ts: at(1000),
    type: "transaction.create",
    payload: { row },
  };

  it("create materializes the row; update replaces it (entity-LWW)", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, create);
    await applyOp(tx, {
      id: "op-edit",
      ts: at(2000),
      type: "transaction.update",
      payload: { row: { ...row, amount: -1200 } },
    });
    const rows = await readAll<Transaction>(state, STORE.transactions);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(-1200);
  });

  it("void writes a NEW row and never touches the original (§0.3)", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, create);
    const voidRow = makeVoidRow(row, { id: "v1" });
    const voidOp: Op = {
      id: "op-void",
      ts: at(3000),
      type: "transaction.void",
      payload: { row: voidRow },
    };
    await applyOp(tx, voidOp);
    await applyOp(tx, voidOp); // replay must not double-count the reversal

    const rows = await readAll<Transaction>(state, STORE.transactions);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === "t1")).toEqual(row); // untouched, byte for byte
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(0);
  });
});

describe("applyOp — every op type is idempotent by id (§8.2)", () => {
  // Table-driven so a new op type added without an idempotency proof fails here.
  const category = makeCategory({ id: "c1", name: "Groceries", type: "expense" });
  const container = makeContainer({ id: "k1", name: "Vacation" });
  const txRow = makeTransaction({
    id: "t1",
    date: "2026-07-20",
    amount: -1000,
    vendor_source: "Starbucks",
    category_id: "c1",
  });
  const snap = makeContainerSnapshot({
    id: "s1",
    container_id: "k1",
    date: "2026-07-20",
    reported_balance: 500000,
  });

  const seed: Op[] = [
    { id: "seed-c", ts: at(1), type: "category.create", payload: { row: category } },
    { id: "seed-k", ts: at(2), type: "container.create", payload: { row: container } },
    { id: "seed-t", ts: at(3), type: "transaction.create", payload: { row: txRow } },
    { id: "seed-s", ts: at(4), type: "snapshot.record", payload: { row: snap } },
  ];

  const cases: Op[] = [
    { id: "o1", ts: at(10), type: "category.create", payload: { row: category } },
    { id: "o2", ts: at(11), type: "category.update", payload: { row: category } },
    { id: "o3", ts: at(12), type: "category.archive", payload: { id: "c1" } },
    { id: "o4", ts: at(13), type: "category.unarchive", payload: { id: "c1" } },
    { id: "o5", ts: at(14), type: "container.create", payload: { row: container } },
    { id: "o6", ts: at(15), type: "container.update", payload: { row: container } },
    { id: "o7", ts: at(16), type: "container.archive", payload: { id: "k1" } },
    { id: "o8", ts: at(17), type: "container.unarchive", payload: { id: "k1" } },
    { id: "o9", ts: at(18), type: "transaction.create", payload: { row: txRow } },
    { id: "o10", ts: at(19), type: "transaction.update", payload: { row: txRow } },
    {
      id: "o11",
      ts: at(20),
      type: "transaction.void",
      payload: { row: makeVoidRow(txRow, { id: "v1" }) },
    },
    { id: "o12", ts: at(21), type: "snapshot.record", payload: { row: snap } },
    { id: "o13", ts: at(22), type: "snapshot.update", payload: { row: snap } },
    { id: "o14", ts: at(23), type: "snapshot.remove", payload: { id: "s1" } },
    {
      id: "o15",
      ts: at(24),
      type: "setting.set",
      payload: { row: { key: SETTING.defaultContainerId, value: "k1" } },
    },
  ];

  it.each(cases.map((op) => [op.type, op] as const))(
    "%s applied twice equals applied once",
    async (_type, op) => {
      const once = newMemoryState();
      const twice = newMemoryState();
      for (const state of [once, twice]) {
        const tx = new MemoryTx(state);
        for (const s of seed) await applyOp(tx, s);
      }
      await applyOp(new MemoryTx(once), op);
      const t2 = new MemoryTx(twice);
      await applyOp(t2, op);
      await applyOp(t2, op);

      for (const store of ALL_STATE_STORES) {
        expect(await readAll(twice, store), store).toEqual(await readAll(once, store));
      }
    },
  );
});

describe("replay — the whole M3 op set converges from any arrival order", () => {
  it("shuffled replay equals ordered replay across every store", async () => {
    const ops: Op[] = [
      {
        id: "a",
        ts: at(1000),
        type: "container.create",
        payload: { row: makeContainer({ id: "k1", name: "Vacation" }) },
      },
      {
        id: "b",
        ts: at(2000),
        type: "category.create",
        payload: { row: makeCategory({ id: "c1", name: "Groceries", type: "expense" }) },
      },
      {
        id: "c",
        ts: at(3000),
        type: "transaction.create",
        payload: {
          row: makeTransaction({
            id: "t1",
            date: "2026-07-20",
            amount: -1000,
            vendor_source: "Starbucks",
            category_id: "c1",
          }),
        },
      },
      {
        id: "d",
        ts: at(4000),
        type: "snapshot.record",
        payload: {
          row: makeContainerSnapshot({
            id: "s1",
            container_id: "k1",
            date: "2026-07-20",
            reported_balance: 100,
          }),
        },
      },
      {
        id: "e",
        ts: at(5000),
        type: "snapshot.record", // same day → upserts d away
        payload: {
          row: makeContainerSnapshot({
            id: "s2",
            container_id: "k1",
            date: "2026-07-20",
            reported_balance: 200,
          }),
        },
      },
      { id: "f", ts: at(6000), type: "container.archive", payload: { id: "k1" } },
      { id: "g", ts: at(7000), type: "container.unarchive", payload: { id: "k1" } },
      {
        id: "h",
        ts: at(8000),
        type: "setting.set",
        payload: { row: { key: SETTING.defaultContainerId, value: "k1" } },
      },
    ];

    const ordered = await replay(ops);
    const shuffled = await replay([
      ops[4],
      ops[7],
      ops[1],
      ops[6],
      ops[0],
      ops[3],
      ops[5],
      ops[2],
    ]);
    for (const store of ALL_STATE_STORES) {
      expect(await readAll(shuffled, store), store).toEqual(
        await readAll(ordered, store),
      );
    }
    // and the end state is the one the total order dictates
    const snaps = await readAll<ContainerSnapshot>(ordered, STORE.containerSnapshots);
    expect(snaps.map((s) => s.id)).toEqual(["s2"]);
    const containers = await readAll<Container>(ordered, STORE.containers);
    expect(containers[0].is_archived).toBe(false); // unarchive is last
  });

  it("an update or archive arriving before its create still lands (replay sorts)", async () => {
    const create: Op = {
      id: "op-create",
      ts: at(1000),
      type: "category.create",
      payload: { row: makeCategory({ id: "c1", name: "Groceries", type: "expense" }) },
    };
    const update: Op = {
      id: "op-update",
      ts: at(2000),
      type: "category.update",
      payload: { row: makeCategory({ id: "c1", name: "Food", type: "expense" }) },
    };
    const archive: Op = {
      id: "op-archive",
      ts: at(3000),
      type: "category.archive",
      payload: { id: "c1" },
    };
    const rows = await readAll<Category>(
      await replay([archive, update, create]),
      STORE.categories,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Food");
    expect(rows[0].is_archived).toBe(true);
  });
});

describe("applyOp — forward compatibility", () => {
  it("throws on an unknown op type instead of silently dropping it", async () => {
    // An op from a newer client must not vanish quietly; Repo.dispatch turns
    // this throw into a transaction abort so the journal stays consistent.
    const rogue = { id: "x", ts: at(1), type: "future.op", payload: {} } as unknown as Op;
    await expect(applyOp(new MemoryTx(newMemoryState()), rogue)).rejects.toThrow();
  });
});
