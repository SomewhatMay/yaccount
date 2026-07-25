import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { Repo, withGeneralWallet, seedGeneralOp } from "./index";
import { STORE } from "./db";
import { MemoryTx, replay, type Op } from "@/core/oplog";
import {
  makeCategory,
  makeTransaction,
  GENERAL_CONTAINER_ID,
  type Category,
  type Container,
  type Transaction,
} from "@/core/model";

const at = (ms: number): string => new Date(ms).toISOString();

const catOp = (id: string, name: string, ms: number): Op => ({
  id: `op-cat-${id}`,
  ts: at(ms),
  type: "category.create",
  payload: { row: makeCategory({ id, name, type: "expense" }) },
});

const txnOp = (id: string, ms: number): Op => ({
  id: `op-txn-${id}`,
  ts: at(ms),
  type: "transaction.create",
  payload: {
    row: makeTransaction({
      id,
      date: "2026-07-04",
      amount: -1250,
      vendor_source: "Market",
      category_id: "c1",
    }),
  },
});

/** The invariant every repo test re-asserts: state IS the replay of the journal. */
async function expectStateMatchesJournal(repo: Repo): Promise<void> {
  const rebuilt = new MemoryTx(await replay(await repo.listOps()));
  for (const store of [STORE.categories, STORE.containers, STORE.transactions]) {
    const byId = (xs: { id: string }[]) => Object.fromEntries(xs.map((x) => [x.id, x]));
    expect(byId(await rebuilt.getAll(store))).toEqual(
      byId(await repo.getAll<{ id: string }>(store)),
    );
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("Repo.resetTo — replace the whole world in one transaction (phase 5)", () => {
  it("clears the previous journal, state and outbox, then replays the new ops", async () => {
    const repo = await Repo.open();
    await repo.dispatch(catOp("c1", "Groceries", 1000));
    await repo.dispatch(txnOp("t1", 2000));
    expect(await repo.getAll<Transaction>(STORE.transactions)).toHaveLength(1);

    await repo.resetTo(withGeneralWallet([catOp("c9", "Rent", 3000)]));

    const cats = await repo.getAll<Category>(STORE.categories);
    expect(cats.map((c) => c.id)).toEqual(["c9"]);
    expect(await repo.getAll<Transaction>(STORE.transactions)).toEqual([]);
    // The old journal is gone too — a reset is a new world, not a merge.
    expect((await repo.listOps()).map((o) => o.id)).toEqual([
      "seed:general",
      "op-cat-c9",
    ]);
    // Nothing is queued for push: the new world is written to Drive wholesale.
    expect(await repo.getOutboxOps()).toEqual([]);
    await expectStateMatchesJournal(repo);
  });

  it("keeps this device's identity — a reset must not mint a new ledger file (§8.4)", async () => {
    const repo = await Repo.open();
    const before = await repo.getDeviceId();
    await repo.resetTo(withGeneralWallet([]));
    expect(await repo.getDeviceId()).toBe(before);
  });

  it("re-seeds the general wallet when the new world has none", async () => {
    const repo = await Repo.open();
    await repo.resetTo(withGeneralWallet([]));
    const containers = await repo.getAll<Container>(STORE.containers);
    expect(containers.map((c) => c.id)).toEqual([GENERAL_CONTAINER_ID]);
  });

  it("seeds deterministically, so two cleared devices converge (§8.2)", async () => {
    const a = await Repo.open("reset-a");
    const b = await Repo.open("reset-b");
    await a.resetTo(withGeneralWallet([]));
    await b.resetTo(withGeneralWallet([]));
    expect((await a.listOps()).map((o) => `${o.id}@${o.ts}`)).toEqual(
      (await b.listOps()).map((o) => `${o.id}@${o.ts}`),
    );
  });

  it("does not add a second wallet when the imported world already has one", async () => {
    const repo = await Repo.open();
    const ops = withGeneralWallet([seedGeneralOp(), catOp("c1", "Groceries", 1000)]);
    await repo.resetTo(ops);
    expect(await repo.getAll<Container>(STORE.containers)).toHaveLength(1);
    expect(ops.filter((o) => o.id === "seed:general")).toHaveLength(1);
  });

  it("writes the meta records it is given inside the same transaction", async () => {
    const repo = await Repo.open();
    await repo.resetTo(withGeneralWallet([]), {
      meta: [{ key: "sync:origin", value: { resetId: "r1" } }],
    });
    expect(await repo.getMeta<{ resetId: string }>("sync:origin")).toEqual({
      resetId: "r1",
    });
  });

  it("leaves everything untouched when an op cannot be applied", async () => {
    const repo = await Repo.open();
    await repo.dispatch(catOp("c1", "Groceries", 1000));
    const before = (await repo.listOps()).map((o) => o.id);

    const rogue = { id: "bad", ts: at(9000), type: "category.explode", payload: {} };
    await expect(repo.resetTo([rogue as unknown as Op])).rejects.toThrow();

    expect((await repo.listOps()).map((o) => o.id)).toEqual(before);
    expect((await repo.getAll<Category>(STORE.categories)).map((c) => c.id)).toEqual([
      "c1",
    ]);
    await expectStateMatchesJournal(repo);
  });

  it("is idempotent — resetting to the same world twice changes nothing", async () => {
    const repo = await Repo.open();
    const ops = withGeneralWallet([catOp("c1", "Groceries", 1000)]);
    await repo.resetTo(ops);
    const first = await repo.listOps();
    await repo.resetTo(ops);
    expect(await repo.listOps()).toEqual(first);
  });
});

describe("Repo meta accessors (app_meta, device-local, never synced §8.4)", () => {
  it("round-trips a value and reads undefined for an unset key", async () => {
    const repo = await Repo.open();
    expect(await repo.getMeta("nothing:here")).toBeUndefined();
    await repo.setMeta("data:orphan", { at: at(1), opCount: 12 });
    expect(await repo.getMeta("data:orphan")).toEqual({ at: at(1), opCount: 12 });
  });

  it("overwrites an existing value", async () => {
    const repo = await Repo.open();
    await repo.setMeta("sync:origin", { resetId: "r1" });
    await repo.setMeta("sync:origin", { resetId: "r2" });
    expect(await repo.getMeta("sync:origin")).toEqual({ resetId: "r2" });
  });

  it("survives a resetTo that does not mention it", async () => {
    const repo = await Repo.open();
    await repo.setMeta("data:orphan", { opCount: 3 });
    await repo.resetTo(withGeneralWallet([]));
    expect(await repo.getMeta("data:orphan")).toEqual({ opCount: 3 });
  });
});
