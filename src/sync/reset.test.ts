import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { Repo, withGeneralWallet } from "@/core/repo";
import { STORE } from "@/core/repo/db";
import type { Op } from "@/core/oplog";
import { makeCategory, type Category, type Container } from "@/core/model";
import { runSync, type SyncResult } from "./checkpointer";
import { FakeDriveFS } from "./fake-drive";
import {
  SNAPSHOT_PATH,
  ORIGIN_PATH,
  ledgerPath,
  archivePath,
  backupPath,
  orphanPath,
  isLiveLedgerName,
  describeBackup,
} from "./paths";
import { parseOrigin, readOrigin } from "./origin";
import {
  runDriveReset,
  listBackups,
  readBackupOps,
  driveGeneration,
  ORIGIN_META_KEY,
  ORPHAN_META_KEY,
} from "./reset";
import { serializeOps, serializeSnapshot, parseSnapshot } from "./serialize";

const at = (ms: number): string => new Date(ms).toISOString();
const createCat = (id: string, name: string, ts: number): Op => ({
  id: `op-${id}-${ts}`,
  ts: at(ts),
  type: "category.create",
  payload: { row: makeCategory({ id, name, type: "expense" }) },
});

const NOW = "2026-07-25T00:45:12.000Z";

/** Bind a repo to `runSync`, with the phase-5 generation bookkeeping wired in. */
function syncOf(repo: Repo, fs: FakeDriveFS, now = NOW) {
  return async (): Promise<SyncResult> => {
    const deviceId = await repo.getDeviceId();
    return runSync({
      fs,
      deviceId,
      listOps: () => repo.listOps(),
      applyRemoteOps: (ops) => repo.applyRemoteOps(ops),
      getOutboxOps: () => repo.getOutboxOps(),
      clearOutbox: (ids) => repo.clearOutbox(ids),
      yearMonth: "2026-07",
      generation: driveGeneration({ fs, repo, deviceId, now: () => now }),
    });
  };
}

const catIds = async (repo: Repo): Promise<string[]> =>
  (await repo.getAll<Category>(STORE.categories)).map((c) => c.id).sort();

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("Retired-data names stay invisible to sync (§8.4)", () => {
  it("a backup or orphan file is never mistaken for a live ledger", () => {
    expect(isLiveLedgerName(backupPath(NOW, "clear"))).toBe(false);
    expect(isLiveLedgerName(orphanPath("dev-b", NOW))).toBe(false);
    expect(isLiveLedgerName(ORIGIN_PATH)).toBe(false);
    // …while a real ledger still is.
    expect(isLiveLedgerName(ledgerPath("dev-a"))).toBe(true);
  });

  it("carries no characters that need escaping in a file name", () => {
    for (const name of [backupPath(NOW, "import"), orphanPath("dev-b", NOW)]) {
      expect(name).not.toMatch(/[:]/);
      expect(name.endsWith(".json")).toBe(true);
    }
  });

  it("describes a retired file so the UI can list it", () => {
    expect(describeBackup(backupPath(NOW, "clear"))).toMatchObject({
      origin: "backup",
      kind: "clear",
      at: NOW,
    });
    expect(describeBackup(orphanPath("dev-b", NOW))).toMatchObject({
      origin: "orphan",
      deviceId: "dev-b",
      at: NOW,
    });
    expect(describeBackup(SNAPSHOT_PATH)).toBeNull();
    expect(describeBackup(ledgerPath("dev-a"))).toBeNull();
    expect(describeBackup(archivePath("dev-a", "2026-06"))).toBeNull();
  });
});

describe("readOrigin — 'no marker' and 'cannot tell' are different answers", () => {
  it("reads a marker that is there", async () => {
    const fs = new FakeDriveFS();
    await runDriveReset({ fs, ops: [], kind: "clear", resetId: "r1", now: NOW });
    const read = await readOrigin(fs);
    expect(read.status).toBe("present");
    if (read.status !== "present") return;
    expect(read.origin.resetId).toBe("r1");
  });

  it("reports a store that genuinely has no marker as absent", async () => {
    const fs = new FakeDriveFS();
    expect(await readOrigin(fs)).toEqual({ status: "absent" });
  });

  it("reports an unreachable store as unknown, NOT as absent", async () => {
    const fs = new FakeDriveFS();
    await runDriveReset({ fs, ops: [], kind: "clear", resetId: "r1", now: NOW });
    fs.offline = true;
    expect(await readOrigin(fs)).toEqual({ status: "unknown" });
  });

  it("treats a corrupt marker as absent rather than throwing", async () => {
    const fs = new FakeDriveFS();
    fs.files.set(ORIGIN_PATH, "{not json");
    expect(await readOrigin(fs)).toEqual({ status: "absent" });
  });
});

describe("runDriveReset — retire, replace, then commit (phase 5)", () => {
  it("retires the whole current world to one backup before overwriting anything", async () => {
    const fs = new FakeDriveFS();
    fs.files.set(SNAPSHOT_PATH, serializeSnapshot([createCat("c1", "Groceries", 1000)]));
    fs.files.set(ledgerPath("dev-a"), serializeOps([createCat("c2", "Rent", 2000)]));
    fs.files.set(ledgerPath("dev-b"), serializeOps([createCat("c3", "Fuel", 3000)]));

    const out = await runDriveReset({
      fs,
      ops: [],
      kind: "clear",
      resetId: "reset-1",
      now: NOW,
    });

    expect(out.backupPath).toBe(backupPath(NOW, "clear"));
    const retired = parseSnapshot(fs.files.get(out.backupPath!)!);
    expect(retired.map((o) => o.id).sort()).toEqual(
      [
        createCat("c1", "Groceries", 1000).id,
        createCat("c2", "Rent", 2000).id,
        createCat("c3", "Fuel", 3000).id,
      ].sort(),
    );
  });

  it("replaces the snapshot with the new world and removes every live ledger", async () => {
    const fs = new FakeDriveFS();
    fs.files.set(SNAPSHOT_PATH, serializeSnapshot([createCat("c1", "Groceries", 1000)]));
    fs.files.set(ledgerPath("dev-a"), serializeOps([createCat("c2", "Rent", 2000)]));

    const world = withGeneralWallet([]);
    await runDriveReset({ fs, ops: world, kind: "clear", resetId: "reset-1", now: NOW });

    expect(parseSnapshot(fs.files.get(SNAPSHOT_PATH)!).map((o) => o.id)).toEqual(
      world.map((o) => o.id),
    );
    expect(fs.files.has(ledgerPath("dev-a"))).toBe(false);
  });

  it("never touches the dated collapse archives — they are the audit trail (§8.4)", async () => {
    const fs = new FakeDriveFS();
    const archive = archivePath("dev-a", "2026-06");
    fs.files.set(archive, serializeOps([createCat("c1", "Groceries", 1000)]));
    fs.files.set(ledgerPath("dev-a"), serializeOps([createCat("c2", "Rent", 2000)]));

    await runDriveReset({ fs, ops: [], kind: "clear", resetId: "reset-1", now: NOW });

    expect(fs.files.get(archive)).toBe(
      serializeOps([createCat("c1", "Groceries", 1000)]),
    );
  });

  it("writes origin.json LAST — it is the commit point", async () => {
    const fs = new FakeDriveFS();
    fs.files.set(SNAPSHOT_PATH, serializeSnapshot([createCat("c1", "Groceries", 1000)]));
    const order: string[] = [];
    const write = fs.write.bind(fs);
    fs.write = async (path: string, content: string) => {
      order.push(path);
      return write(path, content);
    };

    await runDriveReset({ fs, ops: [], kind: "clear", resetId: "reset-1", now: NOW });

    expect(order[order.length - 1]).toBe(ORIGIN_PATH);
    expect(order[0]).toBe(backupPath(NOW, "clear"));
  });

  it("records the generation the other devices will adopt", async () => {
    const fs = new FakeDriveFS();
    await runDriveReset({ fs, ops: [], kind: "import", resetId: "reset-9", now: NOW });
    expect(parseOrigin(fs.files.get(ORIGIN_PATH)!)).toEqual({
      v: 1,
      resetId: "reset-9",
      resetAt: NOW,
      kind: "import",
    });
  });

  it("writes no backup when there was nothing on Drive to retire", async () => {
    const fs = new FakeDriveFS();
    fs.listThrows = true; // fresh account: the root folder does not exist yet
    const out = await runDriveReset({
      fs,
      ops: withGeneralWallet([]),
      kind: "clear",
      resetId: "r",
      now: NOW,
    });
    expect(out.backupPath).toBeNull();
    expect(fs.files.has(SNAPSHOT_PATH)).toBe(true);
    expect(fs.files.has(ORIGIN_PATH)).toBe(true);
  });

  it("refuses to overwrite a store it could not fully enumerate", async () => {
    // The dangerous shape: a transient failure that used to read as "nothing is
    // here", producing no backup and then an overwrite. Better to do nothing.
    const fs = new FakeDriveFS();
    const original = serializeSnapshot([createCat("c1", "Groceries", 1000)]);
    fs.files.set(SNAPSHOT_PATH, original);
    fs.files.set(ledgerPath("dev-a"), serializeOps([createCat("c2", "Rent", 2000)]));
    fs.listThrows = true; // enumeration fails, but the store is NOT empty

    await expect(
      runDriveReset({ fs, ops: [], kind: "clear", resetId: "r", now: NOW }),
    ).rejects.toThrow();

    expect(fs.files.get(SNAPSHOT_PATH)).toBe(original);
    expect(fs.files.has(ledgerPath("dev-a"))).toBe(true);
    expect(fs.files.has(ORIGIN_PATH)).toBe(false);
    expect(await listBackups(fs)).toEqual([]);
  });

  it("aborts rather than guessing when Drive is unreachable", async () => {
    const fs = new FakeDriveFS();
    fs.files.set(SNAPSHOT_PATH, serializeSnapshot([createCat("c1", "Groceries", 1000)]));
    fs.offline = true;
    await expect(
      runDriveReset({ fs, ops: [], kind: "clear", resetId: "r", now: NOW }),
    ).rejects.toThrow();
    expect(fs.files.has(ORIGIN_PATH)).toBe(false);
  });

  it("leaves no generation marker when it fails before committing", async () => {
    const fs = new FakeDriveFS();
    const original = serializeSnapshot([createCat("c1", "Groceries", 1000)]);
    fs.files.set(SNAPSHOT_PATH, original);
    fs.failOn = (path, op) => path === SNAPSHOT_PATH && op === "write";

    await expect(
      runDriveReset({ fs, ops: [], kind: "clear", resetId: "r", now: NOW }),
    ).rejects.toThrow();

    expect(fs.files.has(ORIGIN_PATH)).toBe(false);
    expect(fs.files.get(SNAPSHOT_PATH)).toBe(original); // untouched
    expect(fs.files.has(backupPath(NOW, "clear"))).toBe(true); // retired copy survives
  });
});

describe("listBackups / readBackupOps — what the user can roll back to", () => {
  it("lists retired files newest first and ignores the live ones", async () => {
    const fs = new FakeDriveFS();
    fs.files.set(SNAPSHOT_PATH, serializeSnapshot([]));
    fs.files.set(ORIGIN_PATH, "{}");
    fs.files.set(ledgerPath("dev-a"), "");
    fs.files.set(archivePath("dev-a", "2026-06"), "");
    fs.files.set(backupPath("2026-07-01T00:00:00.000Z", "clear"), serializeSnapshot([]));
    fs.files.set(backupPath("2026-07-20T00:00:00.000Z", "import"), serializeSnapshot([]));
    fs.files.set(orphanPath("dev-b", "2026-07-10T00:00:00.000Z"), serializeSnapshot([]));

    const backups = await listBackups(fs);
    expect(backups.map((b) => b.at)).toEqual([
      "2026-07-20T00:00:00.000Z",
      "2026-07-10T00:00:00.000Z",
      "2026-07-01T00:00:00.000Z",
    ]);
    expect(backups.map((b) => b.origin)).toEqual(["backup", "orphan", "backup"]);
  });

  it("reads a retired op set back out", async () => {
    const fs = new FakeDriveFS();
    const ops = [createCat("c1", "Groceries", 1000)];
    const name = backupPath(NOW, "clear");
    fs.files.set(name, serializeSnapshot(ops));
    expect(await readBackupOps(fs, name)).toEqual(ops);
  });

  it("returns nothing on a fresh account rather than throwing", async () => {
    const fs = new FakeDriveFS();
    fs.listThrows = true;
    expect(await listBackups(fs)).toEqual([]);
  });
});

describe("Adoption — a stale device meets a store that was reset elsewhere", () => {
  /** The user's scenario: the computer clears while the phone is offline. */
  async function clearedElsewhere(fs: FakeDriveFS, a: Repo): Promise<void> {
    const world = withGeneralWallet([]);
    await runDriveReset({ fs, ops: world, kind: "clear", resetId: "reset-1", now: NOW });
    await a.resetTo(world, {
      meta: [{ key: ORIGIN_META_KEY, value: { resetId: "reset-1" } }],
    });
  }

  it("adopts the cleared world, setting its own data aside on Drive first", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    await a.dispatch(createCat("c1", "Groceries", 1000));
    await syncOf(a, fs)();
    await syncOf(b, fs)(); // B has now synced once — it knows this store
    expect(await catIds(b)).toEqual(["c1"]);

    // B goes offline and records something of its own, then A clears everything.
    await b.dispatch(createCat("c2", "Fuel", 2000));
    await clearedElsewhere(fs, a);

    const result = await syncOf(b, fs)();

    expect(result.adopted).toMatchObject({ resetId: "reset-1", kind: "clear" });
    expect(await catIds(b)).toEqual([]); // converged on the cleared world
    const orphan = orphanPath(await b.getDeviceId(), NOW);
    expect(fs.files.has(orphan)).toBe(true);
    // Nothing was lost: B's own offline entry is inside the orphan file.
    expect((await readBackupOps(fs, orphan)).map((o) => o.id)).toContain(
      createCat("c2", "Fuel", 2000).id,
    );
  });

  it("tells the user where their set-aside data went", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    await a.dispatch(createCat("c1", "Groceries", 1000));
    await syncOf(a, fs)();
    await syncOf(b, fs)();
    await clearedElsewhere(fs, a);
    await syncOf(b, fs)();

    expect(await b.getMeta(ORPHAN_META_KEY)).toMatchObject({
      path: orphanPath(await b.getDeviceId(), NOW),
      at: NOW,
      kind: "clear",
    });
  });

  it("does not resurrect the cleared world by pushing its old ops back", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    await a.dispatch(createCat("c1", "Groceries", 1000));
    await syncOf(a, fs)();
    await syncOf(b, fs)();
    await clearedElsewhere(fs, a);

    await syncOf(b, fs)();
    await syncOf(a, fs)();

    expect(await catIds(a)).toEqual([]);
    expect(await catIds(b)).toEqual([]);
  });

  it("keeps this device's identity through an adoption (§8.4)", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    await syncOf(a, fs)();
    await syncOf(b, fs)();
    const before = await b.getDeviceId();
    await clearedElsewhere(fs, a);
    await syncOf(b, fs)();
    expect(await b.getDeviceId()).toBe(before);
  });

  it("is idempotent — a second sync does not set data aside twice", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    await a.dispatch(createCat("c1", "Groceries", 1000));
    await syncOf(a, fs)();
    await syncOf(b, fs)();
    await clearedElsewhere(fs, a);

    await syncOf(b, fs)();
    const after = await syncOf(b, fs)();

    expect(after.adopted).toBeUndefined();
    expect((await listBackups(fs)).filter((x) => x.origin === "orphan")).toHaveLength(1);
  });

  it("a device that has never synced joins without giving up its local data", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    await a.dispatch(createCat("c1", "Groceries", 1000));
    await syncOf(a, fs)();
    await runDriveReset({
      fs,
      ops: withGeneralWallet([createCat("c1", "Groceries", 1000)]),
      kind: "import",
      resetId: "reset-2",
      now: NOW,
    });

    // A brand-new device with work of its own, connecting for the first time.
    const fresh = await Repo.open("dev-fresh");
    await fresh.dispatch(createCat("c9", "Books", 5000));
    const result = await syncOf(fresh, fs)();

    expect(result.adopted).toBeUndefined();
    expect(await catIds(fresh)).toEqual(["c1", "c9"]);
    expect((await listBackups(fs)).filter((x) => x.origin === "orphan")).toHaveLength(0);
  });

  it("a store with no generation marker behaves exactly as before (§8.5)", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    await a.dispatch(createCat("c1", "Groceries", 1000));
    await syncOf(a, fs)();
    await syncOf(b, fs)();
    await b.dispatch(createCat("c2", "Fuel", 2000));
    const result = await syncOf(b, fs)();
    await syncOf(a, fs)();

    expect(result.adopted).toBeUndefined();
    expect(await catIds(a)).toEqual(["c1", "c2"]);
  });

  /**
   * The bug this suite exists to keep dead: a device syncing while OFFLINE used
   * to read "no marker" out of a failed request, forget the generation it held,
   * and then adopt all over again the moment the network returned — toasting and
   * setting its data aside on every single reconnect.
   *
   * Nothing may be inferred from a store that cannot answer.
   */
  it("does not forget the generation when Drive is unreachable", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    await a.dispatch(createCat("c1", "Groceries", 1000));
    await syncOf(a, fs)();
    await syncOf(b, fs)();
    await clearedElsewhere(fs, a);
    await syncOf(b, fs)(); // the one legitimate adoption
    const remembered = await b.getMeta(ORIGIN_META_KEY);

    fs.offline = true;
    await expect(syncOf(b, fs)()).rejects.toThrow();

    expect(await b.getMeta(ORIGIN_META_KEY)).toEqual(remembered);
  });

  it("does not re-adopt when the network comes back (the reported bug)", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    await a.dispatch(createCat("c1", "Groceries", 1000));
    await syncOf(a, fs)();
    await syncOf(b, fs)();
    await clearedElsewhere(fs, a);
    await syncOf(b, fs)();

    fs.offline = true;
    await expect(syncOf(b, fs)()).rejects.toThrow();
    fs.offline = false;

    const back = await syncOf(b, fs)();
    expect(back.adopted).toBeUndefined();
    expect((await listBackups(fs)).filter((x) => x.origin === "orphan")).toHaveLength(1);
  });

  it("keeps work done during the outage instead of setting it aside", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    await syncOf(a, fs)();
    await syncOf(b, fs)();
    await clearedElsewhere(fs, a);
    await syncOf(b, fs)();

    // B works through an outage — several failed ticks, like a real 45s interval.
    fs.offline = true;
    await b.dispatch(createCat("c7", "Offline coffee", 7000));
    for (let i = 0; i < 3; i++) await expect(syncOf(b, fs)()).rejects.toThrow();
    fs.offline = false;

    const back = await syncOf(b, fs)();
    expect(back.adopted).toBeUndefined();
    expect(await catIds(b)).toEqual(["c7"]);

    // …and it reaches the other device rather than dying in an orphan file.
    await syncOf(a, fs)();
    expect(await catIds(a)).toEqual(["c7"]);
  });

  it("a never-synced device does not record a generation it could not read", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    await a.dispatch(createCat("c1", "Groceries", 1000));
    await syncOf(a, fs)();
    await runDriveReset({
      fs,
      ops: withGeneralWallet([createCat("c1", "Groceries", 1000)]),
      kind: "import",
      resetId: "reset-2",
      now: NOW,
    });

    const fresh = await Repo.open("dev-fresh");
    await fresh.dispatch(createCat("c9", "Books", 5000));

    fs.offline = true;
    await expect(syncOf(fresh, fs)()).rejects.toThrow();
    expect(await fresh.getMeta(ORIGIN_META_KEY)).toBeUndefined();
    fs.offline = false;

    // Still a first-time connect, so it MERGES rather than giving up its data.
    const result = await syncOf(fresh, fs)();
    expect(result.adopted).toBeUndefined();
    expect(await catIds(fresh)).toEqual(["c1", "c9"]);
  });

  it("an outage on a store that was never reset changes nothing", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    await a.dispatch(createCat("c1", "Groceries", 1000));
    await syncOf(a, fs)();
    await syncOf(b, fs)();

    fs.offline = true;
    await expect(syncOf(b, fs)()).rejects.toThrow();
    fs.offline = false;

    const back = await syncOf(b, fs)();
    expect(back.adopted).toBeUndefined();
    expect(await listBackups(fs)).toEqual([]);
    expect(await catIds(b)).toEqual(["c1"]);
  });

  it("still seeds a wallet after adopting a cleared world", async () => {
    const fs = new FakeDriveFS();
    const a = await Repo.open("dev-a");
    const b = await Repo.open("dev-b");
    await syncOf(a, fs)();
    await syncOf(b, fs)();
    await clearedElsewhere(fs, a);
    await syncOf(b, fs)();
    expect((await b.getAll<Container>(STORE.containers)).map((c) => c.id)).toEqual([
      "general",
    ]);
  });
});
