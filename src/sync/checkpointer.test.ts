import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { Repo } from "@/core/repo";
import { STORE } from "@/core/repo/db";
import type { Op } from "@/core/oplog";
import { makeCategory, type Category } from "@/core/model";
import { runSync, type DriveFS, type SyncResult } from "./checkpointer";
import { SNAPSHOT_PATH, ledgerPath, archivePath } from "./paths";

const at = (ms: number): string => new Date(ms).toISOString();
const createCat = (id: string, name: string, ts: number): Op => ({
  id: `op-${id}-${ts}`,
  ts: at(ts),
  type: "category.create",
  payload: { row: makeCategory({ id, name, type: "expense" }) },
});
const updateCat = (id: string, name: string, ts: number): Op => ({
  id: `op-upd-${id}-${ts}`,
  ts: at(ts),
  type: "category.update",
  payload: { row: makeCategory({ id, name, type: "expense" }) },
});

/** Pure in-memory Drive (a flat file map) — the subset of drivestore the
 * checkpointer uses. All paths are flat filenames at the store root. */
class FakeDriveFS implements DriveFS {
  files = new Map<string, string>();
  /** When true, `list("")` throws like a fresh account with no root folder yet. */
  listThrows = false;

  async read(path: string): Promise<string> {
    const v = this.files.get(path);
    if (v === undefined) throw new Error(`404 ${path}`);
    return v;
  }
  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
  async append(path: string, content: string): Promise<void> {
    this.files.set(path, (this.files.get(path) ?? "") + content);
  }
  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
  async delete(path: string): Promise<void> {
    if (!this.files.has(path)) throw new Error(`404 ${path}`);
    this.files.delete(path);
  }
  async list(): Promise<{ name: string; type: "file" | "directory" }[]> {
    if (this.listThrows) throw new Error("404 root");
    return [...this.files.keys()].map((name) => ({ name, type: "file" as const }));
  }
}

/** Bind a repo's callbacks to `runSync` — one device's sync tick. */
function syncOf(repo: Repo, fs: DriveFS) {
  return async (
    yearMonth = "2026-07",
    collapseThreshold?: number,
  ): Promise<SyncResult> => {
    const deviceId = await repo.getDeviceId();
    return runSync({
      fs,
      deviceId,
      listOps: () => repo.listOps(),
      applyRemoteOps: (ops) => repo.applyRemoteOps(ops),
      getOutboxOps: () => repo.getOutboxOps(),
      clearOutbox: (ids) => repo.clearOutbox(ids),
      yearMonth,
      collapseThreshold,
    });
  };
}

const catsById = async (repo: Repo): Promise<Record<string, Category>> =>
  Object.fromEntries(
    (await repo.getAll<Category>(STORE.categories)).map((c) => [c.id, c]),
  );

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("Checkpointer — two-client convergence (§8.4/§8.5)", () => {
  it("an op logged on A appears on B after a sync round-trip", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    const syncA = syncOf(a, fs);
    const syncB = syncOf(b, fs);

    await a.dispatch(createCat("c1", "Groceries", 1000));
    await syncA(); // push A's op to ledger_<A>.json
    await syncB(); // B pulls it

    expect((await catsById(b))["c1"]?.name).toBe("Groceries");
  });

  it("concurrent creates on both devices merge to the union", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    const syncA = syncOf(a, fs);
    const syncB = syncOf(b, fs);

    await a.dispatch(createCat("ca", "FromA", 1000));
    await b.dispatch(createCat("cb", "FromB", 2000));
    await syncA();
    await syncB();
    await syncA(); // A pulls B's op

    for (const repo of [a, b]) {
      const cats = await catsById(repo);
      expect(cats["ca"]?.name).toBe("FromA");
      expect(cats["cb"]?.name).toBe("FromB");
    }
  });

  it("concurrent edits to the SAME entity resolve last-writer-wins by (ts,id)", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    // Shared starting point.
    await a.dispatch(createCat("c1", "Base", 1000));
    await syncOf(a, fs)();
    await syncOf(b, fs)();
    // Both edit c1 offline; B's edit is later in the total order.
    await a.dispatch(updateCat("c1", "EditedByA", 2000));
    await b.dispatch(updateCat("c1", "EditedByB", 3000));
    // Everyone syncs until settled.
    await syncOf(a, fs)();
    await syncOf(b, fs)();
    await syncOf(a, fs)();
    await syncOf(b, fs)();

    expect((await catsById(a))["c1"]?.name).toBe("EditedByB");
    expect((await catsById(b))["c1"]?.name).toBe("EditedByB");
  });

  it("offline edits on A are never discarded when B changed data meanwhile (§8.5)", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");

    // A is offline: three local ops queue in its outbox, no sync.
    await a.dispatch(createCat("a1", "A-one", 1000));
    await a.dispatch(createCat("a2", "A-two", 1100));
    await a.dispatch(createCat("a3", "A-three", 1200));
    // B, meanwhile, edits categories and syncs.
    await b.dispatch(createCat("b1", "B-one", 2000));
    await syncOf(b, fs)();

    // A reconnects: pushes its queue AND pulls B's — nothing lost.
    await syncOf(a, fs)();
    await syncOf(b, fs)(); // B pulls A's three back

    for (const repo of [a, b]) {
      const cats = await catsById(repo);
      for (const id of ["a1", "a2", "a3", "b1"]) expect(cats[id]).toBeDefined();
    }
  });
});

describe("Checkpointer — per-device ledgers, no cross-writes (§8.4/#19)", () => {
  it("each device writes ONLY its own ledger file", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    await a.dispatch(createCat("c1", "A", 1000));
    await b.dispatch(createCat("c2", "B", 2000));
    await syncOf(a, fs)();
    await syncOf(b, fs)();

    expect(await fs.exists(ledgerPath(await a.getDeviceId()))).toBe(true);
    expect(await fs.exists(ledgerPath(await b.getDeviceId()))).toBe(true);
  });

  it("a device's ledger bytes are untouched by another device syncing", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    await a.dispatch(createCat("c1", "A", 1000));
    await syncOf(a, fs)();
    const aLedgerPath = ledgerPath(await a.getDeviceId());
    const before = await fs.read(aLedgerPath);

    await b.dispatch(createCat("c2", "B", 2000));
    await syncOf(b, fs)(); // B must never write A's ledger

    expect(await fs.read(aLedgerPath)).toBe(before);
  });

  it("re-syncing without new local ops does not re-append (outbox cleared)", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    await a.dispatch(createCat("c1", "A", 1000));
    await syncOf(a, fs)();
    const path = ledgerPath(await a.getDeviceId());
    const once = await fs.read(path);
    await syncOf(a, fs)(); // no new ops
    expect(await fs.read(path)).toBe(once);
  });
});

describe("Checkpointer — collapse, archive, truncate, fresh-device (§8.4)", () => {
  it("collapses past threshold: writes a snapshot, archives + truncates the ledger", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const deviceId = await a.getDeviceId();

    // Log > threshold ops (threshold = 3 here), pushing each round.
    for (let i = 0; i < 6; i++) {
      await a.dispatch(createCat(`c${i}`, `Cat ${i}`, 1000 + i));
    }
    const result = await syncOf(a, fs)("2026-07", 3);

    expect(result.collapsed).toBe(true);
    expect(await fs.exists(SNAPSHOT_PATH)).toBe(true);
    expect(await fs.exists(archivePath(deviceId, "2026-07"))).toBe(true);
    // Own ledger truncated to (near) empty — its ops are now in the snapshot.
    const remaining = (await fs.read(ledgerPath(deviceId))).trim();
    expect(remaining).toBe("");
  });

  it("a fresh device rebuilds identical state from snapshot + short ledgers", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    for (let i = 0; i < 6; i++) {
      await a.dispatch(createCat(`c${i}`, `Cat ${i}`, 1000 + i));
    }
    await syncOf(a, fs)("2026-07", 3); // collapse happens
    // A logs one more AFTER the snapshot (lands in the live ledger, not snapshot).
    await a.dispatch(createCat("late", "Late", 5000));
    await syncOf(a, fs)("2026-07", 3);

    // Brand-new device C, empty local cache, syncs once.
    const c = await Repo.open("dev-c");
    await syncOf(c, fs)("2026-07", 3);

    const aCats = await catsById(a);
    const cCats = await catsById(c);
    expect(Object.keys(cCats).sort()).toEqual(Object.keys(aCats).sort());
    expect(cCats["late"]?.name).toBe("Late");
  });
});

describe("Checkpointer — resilience (§8.6)", () => {
  it("a local op made before sync survives the merge (delta, not replace)", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    await b.dispatch(createCat("remote", "FromDrive", 1000));
    await syncOf(b, fs)();

    // A has a purely-local op that was never on Drive; syncing must keep it.
    await a.dispatch(createCat("local", "LocalOnly", 2000));
    await syncOf(a, fs)();

    const cats = await catsById(a);
    expect(cats["local"]).toBeDefined();
    expect(cats["remote"]).toBeDefined();
  });

  it("a fresh account (list 404) does not crash and still pushes local ops", async () => {
    const fs = new FakeDriveFS();
    fs.listThrows = true;
    const a = await Repo.open("dev-a");
    await a.dispatch(createCat("c1", "Groceries", 1000));
    const result = await syncOf(a, fs)();
    expect(result.pushed).toBeGreaterThan(0);
    expect(await fs.exists(ledgerPath(await a.getDeviceId()))).toBe(true);
  });
});
