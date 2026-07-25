import type { Op } from "@/core/oplog";
import { compareOps } from "@/core/oplog";
import { withGeneralWallet } from "@/core/repo";
import type { DriveFS, SyncGeneration } from "./checkpointer";
import {
  SNAPSHOT_PATH,
  ORIGIN_PATH,
  backupPath,
  orphanPath,
  describeBackup,
  isLiveLedgerName,
  deviceIdFromLedgerName,
  type RetiredFile,
} from "./paths";
import { parseOps, parseSnapshot, serializeSnapshot } from "./serialize";
import { readOrigin, serializeOrigin, type Origin, type ResetKind } from "./origin";

/** `app_meta` key: the generation this device last saw on Drive. Absent means it
 * has never completed a sync, which is what keeps a first-time connect merging
 * instead of discarding. */
export const ORIGIN_META_KEY = "sync:origin";
/** `app_meta` key: where this device's set-aside data went, so the UI can offer
 * it back. §1.1 — being able to recover in principle is not enough; it has to be
 * visible. */
export const ORPHAN_META_KEY = "data:orphan";

export interface SeenOrigin {
  resetId: string | null;
}

export interface OrphanNote {
  path: string;
  at: string;
  kind: ResetKind;
  opCount: number;
}

/** The slice of `Repo` this module needs — structural, so `src/sync` still
 * imports no IndexedDB and every path below is testable with a plain object. */
export interface GenerationRepo {
  listOps(): Promise<Op[]>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
  resetTo(ops: Op[], opts?: { meta?: { key: string; value: unknown }[] }): Promise<void>;
}

const dedupSort = (ops: Op[]): Op[] => {
  const byId = new Map<string, Op>();
  for (const op of ops) if (!byId.has(op.id)) byId.set(op.id, op);
  return [...byId.values()].sort(compareOps);
};

/** Tolerant enumeration — for listing restore points, where an unreachable store
 * degrading to "nothing to show" is a fine answer. */
async function listNames(fs: DriveFS): Promise<string[]> {
  try {
    return (await fs.list("")).filter((e) => e.type === "file").map((e) => e.name);
  } catch {
    return []; // fresh account — the root folder does not exist yet
  }
}

/**
 * Enumeration for the RESET path, where "nothing is here" is a claim we have to
 * be able to stand behind.
 *
 * `list("")` 404s on a fresh account, which is why the tolerant version above
 * swallows failures — but a reset then overwrites the snapshot, so mistaking an
 * outage for an empty store would skip the backup and destroy the world it was
 * supposed to preserve. So a failure is followed by a probe: only a confirmed
 * absent snapshot counts as genuinely fresh. Anything else throws, and it throws
 * before a single byte on Drive has been touched.
 */
async function listNamesForReset(fs: DriveFS): Promise<string[]> {
  try {
    return (await fs.list("")).filter((e) => e.type === "file").map((e) => e.name);
  } catch (err) {
    if (await fs.exists(SNAPSHOT_PATH)) {
      throw new Error(
        "Drive could not be listed, so the current data could not be backed up. Nothing was changed.",
        { cause: err },
      );
    }
    return []; // genuinely fresh account — nothing to retire
  }
}

/**
 * Everything Drive currently holds as ONE replayable op set: the snapshot plus
 * every live ledger. Dated archives are excluded — their ops are already folded
 * into the snapshot, so including them would just duplicate history.
 *
 * Only files we actually enumerated are read, and a failed read PROPAGATES. That
 * combination is deliberate: it removes the fresh-store 404 ambiguity that once
 * justified degrading a failure to `[]`, so an incomplete backup can no longer
 * masquerade as a complete one.
 */
async function readCurrentWorld(fs: DriveFS, names: string[]): Promise<Op[]> {
  const present = new Set(names);
  const ledgers = names.filter(isLiveLedgerName);
  const [snapshot, perLedger] = await Promise.all([
    present.has(SNAPSHOT_PATH)
      ? fs.read(SNAPSHOT_PATH).then(parseSnapshot)
      : Promise.resolve([] as Op[]),
    Promise.all(ledgers.map((n) => fs.read(n).then(parseOps))),
  ]);
  return dedupSort([...snapshot, ...perLedger.flat()]);
}

export interface DriveResetInput {
  fs: DriveFS;
  /** The world to install. Written to Drive verbatim. */
  ops: Op[];
  kind: ResetKind;
  resetId: string;
  now: string;
}

export interface DriveResetOutcome {
  /** Where the previous world was retired to, or null if there was none. */
  backupPath: string | null;
  removedLedgers: string[];
  origin: Origin;
}

/**
 * Replace everything on Drive with `ops`, retiring what was there first.
 *
 * Order is the whole design, and it is deliberately Drive-first with
 * `origin.json` written LAST:
 *
 *   1. copy the current snapshot + every live ledger into ONE `backup_*` file
 *   2. write the new `snapshot.json`
 *   3. delete the live ledgers (their contents are inside the backup)
 *   4. write `origin.json` — the commit
 *
 * Nothing here is a true delete of user data: step 3 only removes files whose
 * every op step 1 just preserved, and the dated collapse archives are never
 * touched at all. That is what makes "clear" recoverable — the app stops reading
 * the old world, it does not destroy it.
 *
 * Every failure point is non-lossy, so **retry is the recovery** and no
 * two-phase bookkeeping is needed: a crash before step 4 leaves other devices
 * merging the new snapshot as an ordinary delta (a superset — messy, never
 * lossy), and a crash after step 4 but before the caller resets locally leaves
 * THIS device stale, which the adoption path below then heals on its own.
 */
export async function runDriveReset(input: DriveResetInput): Promise<DriveResetOutcome> {
  const { fs, ops, kind, resetId, now } = input;

  const names = await listNamesForReset(fs);
  const current = await readCurrentWorld(fs, names);

  let backup: string | null = null;
  if (current.length > 0) {
    backup = backupPath(now, kind);
    await fs.write(backup, serializeSnapshot(current));
  }

  await fs.write(SNAPSHOT_PATH, serializeSnapshot(dedupSort(ops)));

  const removedLedgers: string[] = [];
  for (const name of names.filter(isLiveLedgerName)) {
    try {
      await fs.delete(name);
      removedLedgers.push(name);
    } catch {
      // Already gone, or a transient failure. The new snapshot supersedes it and
      // the next reset will sweep it up; a leftover ledger merges as a superset.
    }
  }

  const origin: Origin = { v: 1, resetId, resetAt: now, kind };
  await fs.write(ORIGIN_PATH, serializeOrigin(origin));

  return { backupPath: backup, removedLedgers, origin };
}

/** Set a device's own journal aside on Drive, outside anything sync reads. */
export async function writeOrphan(
  fs: DriveFS,
  deviceId: string,
  ops: Op[],
  now: string,
): Promise<string> {
  const path = orphanPath(deviceId, now);
  await fs.write(path, serializeSnapshot(dedupSort(ops)));
  return path;
}

/** Every restore point on Drive, newest first. */
export async function listBackups(fs: DriveFS): Promise<RetiredFile[]> {
  const retired = (await listNames(fs))
    .map(describeBackup)
    .filter((r): r is RetiredFile => r !== null);
  return retired.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export async function readBackupOps(fs: DriveFS, name: string): Promise<Op[]> {
  return parseSnapshot(await fs.read(name));
}

/**
 * Wire the generation bookkeeping to a repo — the object `runSync` consults at
 * the top of every cycle.
 *
 * `adopt` is the answer to "the computer cleared everything while the phone was
 * offline". The phone's own journal is written to Drive as an orphan file and
 * noted in `app_meta` (so Settings can offer it back), then local state is reset
 * to EMPTY and the ordinary pull refills it from the new world. Its offline
 * edits are deliberately not replayed into that world: doing so would resurrect
 * exactly what the user chose to discard. They are preserved, not applied — and
 * the user is told, because a silent set-aside would be a silent loss (§0.3).
 */
export function driveGeneration(deps: {
  fs: DriveFS;
  repo: GenerationRepo;
  deviceId: string;
  now: () => string;
}): SyncGeneration {
  const { fs, repo, deviceId, now } = deps;
  return {
    read: () => readOrigin(fs),

    seen: async () => (await repo.getMeta<SeenOrigin>(ORIGIN_META_KEY))?.resetId,

    remember: async (resetId) => {
      await repo.setMeta(ORIGIN_META_KEY, { resetId } satisfies SeenOrigin);
    },

    adopt: async (remote) => {
      const localOps = await repo.listOps();
      const at = now();
      const path = await writeOrphan(fs, deviceId, localOps, at);
      const note: OrphanNote = {
        path,
        at,
        kind: remote.kind,
        opCount: localOps.length,
      };
      // Both writes ride the reset transaction, so this device can never end up
      // with the new generation recorded but the data still old (or vice versa).
      await repo.resetTo(withGeneralWallet([]), {
        meta: [
          {
            key: ORIGIN_META_KEY,
            value: { resetId: remote.resetId } satisfies SeenOrigin,
          },
          { key: ORPHAN_META_KEY, value: note },
        ],
      });
      return note;
    },
  };
}
