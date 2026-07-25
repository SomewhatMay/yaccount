/**
 * Drive AppData layout for the Checkpointer (§8.4). Everything lives at the store
 * root (drivestore's `rootName: "yaccount"` folder):
 *
 *   snapshot.json                    — consolidated op set (one-time fresh-device load)
 *   ledger_<deviceId>.json           — one append-only log per device (JSONL)
 *   ledger_<deviceId>_<YYYY-MM>.json — pre-collapse archives (permanent audit trail)
 *
 * Per-device files are the locked design (§8.4/#19): Drive AppData has no atomic
 * CAS, so the only "never lose a write" guarantee is that no two devices ever
 * write the same object. These helpers are pure string math — no I/O — so the
 * checkpointer stays unit-testable.
 */

export const SNAPSHOT_PATH = "snapshot.json";
const LEDGER_PREFIX = "ledger_";
const LEDGER_EXT = ".json";

/**
 * The generation marker (phase 5). Clearing or importing mints a fresh `resetId`
 * here; a device that has synced before and now sees a different one knows the
 * store was deliberately reset rather than merely empty. Without it an emptied
 * Drive is indistinguishable from a fresh Google account, and a stale device
 * would either diverge forever or push the cleared data straight back.
 */
export const ORIGIN_PATH = "origin.json";

const BACKUP_PREFIX = "backup_";
const ORPHAN_PREFIX = "orphan_";

/** `:` is legal in Drive but hostile in a file name a person may download. */
const stamp = (iso: string): string => iso.replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
const unstamp = (s: string): string => {
  const [day, time] = s.split("T");
  if (!time) return s;
  return `${day}T${time.replace(/-/g, ":").replace(/Z$/, ".000Z")}`;
};

/**
 * The whole pre-change world, retired just before a clear/import/restore
 * overwrites it. Retired data is never deleted — the app simply stops reading it
 * (§1.1: the inverse of an action must remain available), and these files are
 * what the Settings backup list offers to roll back to.
 */
export function backupPath(at: string, kind: string): string {
  return `${BACKUP_PREFIX}${stamp(at)}_${kind}${LEDGER_EXT}`;
}

/** A stale device's own journal, set aside when it adopts a reset it missed. */
export function orphanPath(deviceId: string, at: string): string {
  return `${ORPHAN_PREFIX}${deviceId}_${stamp(at)}${LEDGER_EXT}`;
}

export interface RetiredFile {
  name: string;
  origin: "backup" | "orphan";
  /** Why the world was retired — only a backup knows. */
  kind: string | null;
  /** Which device set its data aside — only an orphan knows. */
  deviceId: string | null;
  at: string;
}

/**
 * Recognise a retired file, or `null` for anything sync still reads. Deliberately
 * strict: a live ledger, its dated archive, the snapshot and the origin marker
 * must never be offered as a restore point.
 */
export function describeBackup(name: string): RetiredFile | null {
  if (!name.endsWith(LEDGER_EXT)) return null;
  const body = name.slice(0, -LEDGER_EXT.length);

  if (body.startsWith(BACKUP_PREFIX)) {
    const rest = body.slice(BACKUP_PREFIX.length);
    const split = rest.lastIndexOf("_");
    if (split <= 0) return null;
    return {
      name,
      origin: "backup",
      kind: rest.slice(split + 1),
      deviceId: null,
      at: unstamp(rest.slice(0, split)),
    };
  }

  if (body.startsWith(ORPHAN_PREFIX)) {
    const rest = body.slice(ORPHAN_PREFIX.length);
    const split = rest.lastIndexOf("_");
    if (split <= 0) return null;
    return {
      name,
      origin: "orphan",
      kind: null,
      deviceId: rest.slice(0, split),
      at: unstamp(rest.slice(split + 1)),
    };
  }

  return null;
}

/** This device's live ledger. */
export function ledgerPath(deviceId: string): string {
  return `${LEDGER_PREFIX}${deviceId}${LEDGER_EXT}`;
}

/** A dated archive of a device's ledger, written just before a collapse. */
export function archivePath(deviceId: string, yearMonth: string): string {
  return `${LEDGER_PREFIX}${deviceId}_${yearMonth}${LEDGER_EXT}`;
}

/** A LIVE ledger file name (`ledger_<id>.json`) — excludes dated archives, which
 * carry an extra `_YYYY-MM` segment before `.json`. Archives are audit-only and
 * must never be replayed into live state (their ops are already in the snapshot). */
export function isLiveLedgerName(name: string): boolean {
  if (!name.startsWith(LEDGER_PREFIX) || !name.endsWith(LEDGER_EXT)) return false;
  const body = name.slice(LEDGER_PREFIX.length, -LEDGER_EXT.length);
  // An archive's body ends in `_YYYY-MM`; a live ledger's is the bare deviceId.
  return !/_\d{4}-\d{2}$/.test(body);
}

/** The deviceId encoded in a live ledger file name, or null if it isn't one. */
export function deviceIdFromLedgerName(name: string): string | null {
  if (!isLiveLedgerName(name)) return null;
  return name.slice(LEDGER_PREFIX.length, -LEDGER_EXT.length);
}
