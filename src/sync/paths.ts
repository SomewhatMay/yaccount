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
