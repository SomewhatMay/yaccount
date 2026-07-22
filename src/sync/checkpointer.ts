import type { Op } from "@/core/oplog";
import { compareOps } from "@/core/oplog";
import {
  SNAPSHOT_PATH,
  ledgerPath,
  archivePath,
  isLiveLedgerName,
  deviceIdFromLedgerName,
} from "./paths";
import { parseOps, parseSnapshot, serializeOps, serializeSnapshot } from "./serialize";

/**
 * The minimal Drive surface the Checkpointer needs — a structural subset of
 * drivestore's `DriveStore` (§4), so the real store satisfies it directly and
 * tests supply a pure in-memory fake. Keeping this pure is what lets the whole
 * two-client merge protocol be unit-tested with no real Drive (impl §5).
 */
export interface DriveFS {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  list(path: string): Promise<{ name: string; type: "file" | "directory" }[]>;
}

/** Repo callbacks the sync needs — injected so the engine imports no IndexedDB. */
export interface SyncDeps {
  fs: DriveFS;
  deviceId: string;
  /** This device's full local journal (== the global known op set after a merge). */
  listOps: () => Promise<Op[]>;
  /** Merge remote ops into local state under the total order (§8.5, repo). */
  applyRemoteOps: (ops: Op[]) => Promise<void>;
  /** Locally-authored ops not yet flushed to this device's ledger. */
  getOutboxOps: () => Promise<Op[]>;
  /** Drop flushed op-ids from the outbox after a successful ledger append. */
  clearOutbox: (ids: string[]) => Promise<void>;
  /** `YYYY-MM` for archive naming — the clock lives in the caller, not here. */
  yearMonth: string;
  /** Collapse when un-snapshotted op count exceeds this (§8.4, ~500). */
  collapseThreshold?: number;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  collapsed: boolean;
}

const DEFAULT_COLLAPSE_THRESHOLD = 500;

function dedupSort(ops: Op[]): Op[] {
  const byId = new Map<string, Op>();
  for (const op of ops) if (!byId.has(op.id)) byId.set(op.id, op);
  return [...byId.values()].sort(compareOps);
}

/** The snapshot's op set, or `[]` if no snapshot exists yet (fresh store). */
async function readSnapshot(fs: DriveFS): Promise<Op[]> {
  if (!(await fs.exists(SNAPSHOT_PATH))) return [];
  return parseSnapshot(await fs.read(SNAPSHOT_PATH));
}

/** The current live-ledger file names (archives excluded — their ops are already
 * in the snapshot). `list("")` 404s on a fresh account → treated as empty. */
async function listLiveLedgerNames(fs: DriveFS): Promise<string[]> {
  let entries: { name: string; type: "file" | "directory" }[];
  try {
    entries = await fs.list("");
  } catch {
    return []; // fresh store — nothing there yet
  }
  return entries
    .filter((e) => e.type === "file" && isLiveLedgerName(e.name))
    .map((e) => e.name);
}

/** All ops across every device's live ledger. */
async function readLedgers(fs: DriveFS): Promise<Op[]> {
  const names = await listLiveLedgerNames(fs);
  const ledgerOps: Op[] = [];
  for (const name of names) {
    try {
      ledgerOps.push(...parseOps(await fs.read(name)));
    } catch {
      // a ledger vanished between list and read — skip; re-seen next pull
    }
  }
  return ledgerOps;
}

/**
 * Consolidate: archive every current live ledger to a dated file (permanent
 * audit trail, §8.4), then write the fresh snapshot over the full known op set.
 * The snapshot is *derived*, so a raced double-collapse is redundant work, never
 * data loss — hence no leader election (§8.4).
 */
async function collapse(fs: DriveFS, allOps: Op[], yearMonth: string): Promise<void> {
  // Re-list HERE (not at pull time): this device may have just appended its own
  // ledger in the push step, and its ops must be archived too.
  const liveLedgerNames = await listLiveLedgerNames(fs);
  for (const name of liveLedgerNames) {
    const deviceId = deviceIdFromLedgerName(name);
    if (!deviceId) continue;
    let content = "";
    try {
      content = await fs.read(name);
    } catch {
      continue; // ledger gone — nothing to archive
    }
    if (content.trim()) await fs.write(archivePath(deviceId, yearMonth), content);
  }
  await fs.write(SNAPSHOT_PATH, serializeSnapshot(dedupSort(allOps)));
}

/**
 * Rewrite THIS device's ledger to drop ops already folded into the snapshot
 * (§8.4 rotation). Race-free: a device only ever writes its own ledger, so no
 * other writer can be touching this file. A no-op when nothing was folded.
 */
async function truncateOwnLedger(
  fs: DriveFS,
  deviceId: string,
  foldedIds: Set<string>,
): Promise<void> {
  const path = ledgerPath(deviceId);
  if (!(await fs.exists(path))) return;
  const current = parseOps(await fs.read(path));
  const remaining = current.filter((o) => !foldedIds.has(o.id));
  if (remaining.length === current.length) return;
  await fs.write(path, serializeOps(remaining));
}

/**
 * One background sync cycle (§8.4/§8.5/§8.6): pull the snapshot + all device
 * ledgers → merge them into local state under the total order → append this
 * device's queued ops to its OWN ledger → collapse if the un-snapshotted op
 * count is over threshold → truncate this device's ledger to post-snapshot ops.
 *
 * Every step is idempotent: ops dedupe by id, the merge is LWW by (`ts`,`id`),
 * appends carry only un-flushed outbox ops, and truncation only drops folded
 * ids. Safe to run repeatedly and concurrently across devices.
 */
export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const {
    fs,
    deviceId,
    listOps,
    applyRemoteOps,
    getOutboxOps,
    clearOutbox,
    yearMonth,
    collapseThreshold = DEFAULT_COLLAPSE_THRESHOLD,
  } = deps;

  // 1 — PULL snapshot + every live device ledger.
  const snapshotOps = await readSnapshot(fs);
  const ledgerOps = await readLedgers(fs);

  // 2 — MERGE into local state (idempotent, LWW under the total order).
  await applyRemoteOps([...snapshotOps, ...ledgerOps]);

  // 3 — PUSH: append this device's queued ops to its own ledger, then clear them.
  const outbox = await getOutboxOps();
  if (outbox.length > 0) {
    await fs.append(ledgerPath(deviceId), serializeOps(outbox));
    await clearOutbox(outbox.map((o) => o.id));
  }

  // 4 — COLLAPSE if too many un-snapshotted ops (across all devices).
  const allOps = await listOps(); // full local journal == global known set post-merge
  const snapshotIds = new Set(snapshotOps.map((o) => o.id));
  const unSnapshotted = allOps.filter((o) => !snapshotIds.has(o.id));
  let collapsed = false;
  let foldedIds = snapshotIds;
  if (unSnapshotted.length > collapseThreshold) {
    await collapse(fs, allOps, yearMonth);
    foldedIds = new Set(allOps.map((o) => o.id)); // fresh snapshot folded everything
    collapsed = true;
  }

  // 5 — TRUNCATE this device's ledger to ops not already in the snapshot.
  await truncateOwnLedger(fs, deviceId, foldedIds);

  return {
    pulled: snapshotOps.length + ledgerOps.length,
    pushed: outbox.length,
    collapsed,
  };
}
