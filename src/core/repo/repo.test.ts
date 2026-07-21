import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { Repo } from "@/core/repo";
import { STORE } from "@/core/repo/db";
import { replay, MemoryTx, type Op } from "@/core/oplog";
import {
  makeCategory,
  makeContainer,
  GENERAL_CONTAINER_ID,
  type Category,
  type Container,
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
