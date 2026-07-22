import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { Repo } from "@/core/repo";
import { STORE } from "@/core/repo/db";
import { replay, MemoryTx, compareOps, type Op } from "@/core/oplog";
import { makeCategory, type Category } from "@/core/model";

const at = (ms: number): string => new Date(ms).toISOString();

const createCat = (
  id: string,
  name: string,
  ts: number,
  opId = `op-${id}-${ts}`,
): Op => ({
  id: opId,
  ts: at(ts),
  type: "category.create",
  payload: { row: makeCategory({ id, name, type: "expense" }) },
});
const updateCat = (
  id: string,
  name: string,
  ts: number,
  opId = `op-${id}-${ts}`,
): Op => ({
  id: opId,
  ts: at(ts),
  type: "category.update",
  payload: { row: makeCategory({ id, name, type: "expense" }) },
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("Repo.applyRemoteOps — merge under the total order (§8.5, impl §10 #33)", () => {
  it("merges genuinely-new remote ops; live state == replay(listOps())", async () => {
    const repo = await Repo.open();
    await repo.dispatch(createCat("c1", "Groceries", 1000));

    await repo.applyRemoteOps([
      createCat("c2", "Rent", 2000),
      updateCat("c1", "Food", 3000),
    ]);

    const c1 = await repo.get<Category>(STORE.categories, "c1");
    const c2 = await repo.get<Category>(STORE.categories, "c2");
    expect(c1!.name).toBe("Food");
    expect(c2!.name).toBe("Rent");

    // The pinned invariant must still hold after a merge.
    const live = await repo.getAll<Category>(STORE.categories);
    const rebuilt = await replay(await repo.listOps());
    const replayed = await new MemoryTx(rebuilt).getAll<Category>(STORE.categories);
    const byId = (xs: Category[]) => Object.fromEntries(xs.map((x) => [x.id, x]));
    expect(byId(replayed)).toEqual(byId(live));
  });

  it("re-applying the same remote ops is idempotent (dedupe by id, §8.2)", async () => {
    const repo = await Repo.open();
    const ops = [createCat("c1", "Groceries", 1000)];
    await repo.applyRemoteOps(ops);
    const before = (await repo.listOps()).length;
    await repo.applyRemoteOps(ops);
    expect((await repo.listOps()).length).toBe(before);
  });

  it("a LATE older remote update never clobbers a newer local edit (the #33 bug)", async () => {
    const repo = await Repo.open();
    // Local edit is newer in the total order.
    await repo.dispatch(updateCat("c1", "LocalNewer", 3000, "op-local"));
    // A stale remote update for the same entity arrives afterward.
    await repo.applyRemoteOps([updateCat("c1", "RemoteOlder", 1000, "op-remote")]);
    const c1 = await repo.get<Category>(STORE.categories, "c1");
    expect(c1!.name).toBe("LocalNewer"); // newer (ts) wins, not arrival order
  });

  it("skips an unknown-type remote op (newer client) without wedging the merge", async () => {
    const repo = await Repo.open();
    const future = {
      id: "op-future",
      ts: at(9000),
      type: "widget.frobnicate",
      payload: {},
    } as unknown as Op;
    await repo.applyRemoteOps([future, createCat("c1", "Groceries", 1000)]);
    // The known op still applied; the unknown one was dropped, not journaled.
    expect((await repo.get<Category>(STORE.categories, "c1"))!.name).toBe("Groceries");
    expect((await repo.listOps()).some((o) => o.id === "op-future")).toBe(false);
  });

  it("preserves a local op dispatched before the merge (delta, not wholesale replace, §8.6)", async () => {
    const repo = await Repo.open();
    await repo.dispatch(createCat("local", "InSession", 5000, "op-in-session"));
    await repo.applyRemoteOps([createCat("remote", "FromDrive", 1000, "op-drive")]);
    expect(await repo.get<Category>(STORE.categories, "local")).toBeDefined();
    expect(await repo.get<Category>(STORE.categories, "remote")).toBeDefined();
  });
});

describe("Repo — the local outbox (locally-authored ops pending push, §8.4/§8.5)", () => {
  it("dispatch enqueues the op; applyRemoteOps does NOT (only own ops go to own ledger)", async () => {
    const repo = await Repo.open();
    await repo.dispatch(createCat("c1", "Local", 1000, "op-local"));
    await repo.applyRemoteOps([createCat("c2", "Remote", 2000, "op-remote")]);

    const outbox = await repo.getOutboxOps();
    const ids = outbox.map((o) => o.id);
    expect(ids).toContain("op-local");
    expect(ids).not.toContain("op-remote");
  });

  it("outbox ops carry the full op payload in total order (for the ledger append)", async () => {
    const repo = await Repo.open();
    await repo.dispatch(createCat("b", "B", 2000, "op-b"));
    await repo.dispatch(createCat("a", "A", 1000, "op-a"));
    const outbox = await repo.getOutboxOps();
    // Only user ops here (plus the seed). Assert order is canonical.
    const sorted = [...outbox].sort(compareOps);
    expect(outbox.map((o) => o.id)).toEqual(sorted.map((o) => o.id));
  });

  it("clearOutbox removes the flushed ids and leaves the rest", async () => {
    const repo = await Repo.open();
    await repo.dispatch(createCat("c1", "One", 1000, "op-1"));
    await repo.dispatch(createCat("c2", "Two", 2000, "op-2"));
    await repo.clearOutbox(["op-1"]);
    const remaining = (await repo.getOutboxOps()).map((o) => o.id);
    expect(remaining).not.toContain("op-1");
    expect(remaining).toContain("op-2");
  });

  it("re-dispatching a known op id does not double-enqueue it", async () => {
    const repo = await Repo.open();
    const op = createCat("c1", "One", 1000, "op-1");
    await repo.dispatch(op);
    await repo.dispatch(op);
    const count = (await repo.getOutboxOps()).filter((o) => o.id === "op-1").length;
    expect(count).toBe(1);
  });
});
