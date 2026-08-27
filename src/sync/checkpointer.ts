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
import type { Origin, OriginRead } from "./origin";

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

/**
 * Generation bookkeeping (phase 5) — how a device notices that the store was
 * deliberately cleared or replaced somewhere else. Injected rather than
 * implemented here so the checkpointer keeps knowing nothing about IndexedDB.
 * See `driveGeneration` in `reset.ts` for the real wiring.
 */
export interface SyncGeneration {
  /** The store's generation — including whether we could tell at all. */
  read: () => Promise<OriginRead>;
  /** The generation this device last saw. `undefined` = it has never synced. */
  seen: () => Promise<string | null | undefined>;
  remember: (resetId: string | null) => Promise<void>;
  /** Set local data aside and reset to the new generation's empty world. */
  adopt: (remote: Origin) => Promise<{ path: string; opCount: number }>;
}

/** Repo callbacks the sync needs — injected so the engine imports no IndexedDB. */
export interface SyncDeps {
  fs: DriveFS;
  deviceId: string;
  /** This device's full local journal (== the global known op set after a merge). */
  listOps: () => Promise<Op[]>;
  /** Merge remote ops into local state under the total order (§8.5, repo). */
  applyRemoteOps: (ops: Op[]) => Promise<void | boolean>;
  /** Locally-authored ops not yet flushed to this device's ledger. */
  getOutboxOps: () => Promise<Op[]>;
  /** Drop flushed op-ids from the outbox after a successful ledger append. */
  clearOutbox: (ids: string[]) => Promise<void>;
  /** `YYYY-MM` for archive naming — the clock lives in the caller, not here. */
  yearMonth: string;
  /** Collapse when un-snapshotted op count exceeds this (§8.4, ~500). */
  collapseThreshold?: number;
  /** Phase-5 reset detection. Omitted → the pre-phase-5 behaviour exactly. */
  generation?: SyncGeneration;
}

export interface SyncResult {
  pushed: number;
  collapsed: boolean;
  /** Whether this cycle replayed local state after receiving new remote ops. */
  rebuilt: boolean;
  /** Set only on the cycle where this device adopted a reset made elsewhere. */
  adopted?: {
    resetId: string;
    resetAt: string;
    kind: Origin["kind"];
    /** Where this device's previous journal was set aside. */
    path: string;
    opCount: number;
  };
}

const DEFAULT_COLLAPSE_THRESHOLD = 500;

function dedupSort(ops: Op[]): Op[] {
  const byId = new Map<string, Op>();
  for (const op of ops) if (!byId.has(op.id)) byId.set(op.id, op);
  return [...byId.values()].sort(compareOps);
}

/** The snapshot's op set, or `[]` if no snapshot exists yet (a 404 read on a
 * fresh store). One round-trip — the parse path already tolerates junk. */
async function readSnapshot(fs: DriveFS): Promise<Op[]> {
  try {
    return parseSnapshot(await fs.read(SNAPSHOT_PATH));
  } catch {
    return []; // no snapshot yet
  }
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

/** All ops across every device's live ledger. Reads run in parallel — independent
 * round-trips, and a ledger that vanished between list and read just degrades to
 * `[]` (re-seen next pull). */
async function readLedgers(fs: DriveFS): Promise<Op[]> {
  const names = await listLiveLedgerNames(fs);
  const perLedger = await Promise.all(
    names.map((name) => fs.read(name).then(parseOps, () => [] as Op[])),
  );
  return perLedger.flat();
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
    generation,
  } = deps;

  // 0 — GENERATION: has this store been deliberately cleared/replaced since we
  // last looked? This has to run BEFORE the pull, because adopting resets local
  // state and the pull is what refills it from the new world.
  const adopted = generation ? await reconcileGeneration(generation) : undefined;

  // 1 — PULL snapshot + every live device ledger (independent — fetch together).
  const [snapshotOps, ledgerOps] = await Promise.all([readSnapshot(fs), readLedgers(fs)]);

  // 2 — MERGE into local state (idempotent, LWW under the total order).
  const rebuilt = (await applyRemoteOps([...snapshotOps, ...ledgerOps])) === true;

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

  return { pushed: outbox.length, collapsed, rebuilt, adopted };
}

/**
 * Decide what the store's generation means for this device (phase 5).
 *
 * **Only a positive reading is ever acted on.** Adopting means standing this
 * device's data down, so it may happen only when we have actually held the
 * marker in our hands and seen an id different from the one we recorded.
 *
 * | seen                  | read      | action                        |
 * |-----------------------|-----------|-------------------------------|
 * | anything              | `unknown` | nothing — infer nothing       |
 * | `undefined` (fresh)   | `present` | remember, do not adopt        |
 * | `undefined`           | `absent`  | remember null, do not adopt   |
 * | recorded, same id     | `present` | nothing                       |
 * | recorded, another id  | `present` | **adopt**, then remember      |
 * | recorded              | `absent`  | nothing — never forget        |
 *
 * The last two rows are the fix for a real bug. A device used to forget its
 * generation whenever the marker looked missing, which an offline tick made it
 * look constantly; on reconnect the marker came back, compared unequal to the
 * forgotten `null`, and the device adopted again — toasting and setting its
 * data aside on **every reconnect**. Refusing to forget makes that unreachable
 * rather than merely unlikely, and costs only this: if the marker were deleted
 * by hand, the device stops adopting, which is the non-destructive direction.
 *
 * A device that has never synced is likewise never talked into recording a
 * generation it could not read — staying "never synced" is the state that keeps
 * its offline work safe.
 */
async function reconcileGeneration(
  generation: SyncGeneration,
): Promise<SyncResult["adopted"]> {
  const read = await generation.read();
  if (read.status === "unknown") return undefined;

  const seen = await generation.seen();
  const remoteId = read.status === "present" ? read.origin.resetId : null;

  if (seen === undefined) {
    await generation.remember(remoteId);
    return undefined;
  }
  if (read.status === "absent" || seen === remoteId) return undefined;

  const remote = read.origin;
  const { path, opCount } = await generation.adopt(remote);
  await generation.remember(remote.resetId);
  return {
    resetId: remote.resetId,
    resetAt: remote.resetAt,
    kind: remote.kind,
    path,
    opCount,
  };
}
