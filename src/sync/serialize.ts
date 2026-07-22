import type { Op } from "@/core/oplog";

/**
 * Wire formats for the Checkpointer files (§8.2/§8.4).
 *
 * **Ledgers are JSONL** — one op per line — because they grow via
 * `drivestore.append()`. A newline-delimited stream is append-friendly (no need
 * to rewrite the whole file per op) and crash-resistant: a torn final line from
 * an interrupted append is simply skipped on parse, never corrupting the ops
 * before it. `append` is documented non-atomic, but each device writes only its
 * own ledger (§8.4), so there are no concurrent writers to interleave.
 *
 * **The snapshot is a single JSON object** (`{v, ops}`) written whole via
 * `write`, since it is regenerated atomically on collapse rather than appended.
 */

export interface Snapshot {
  v: 1;
  ops: Op[];
}

/** Serialize ops as JSONL for a ledger append (each ends in a newline). */
export function serializeOps(ops: Op[]): string {
  return ops.map((op) => JSON.stringify(op)).join("\n") + (ops.length ? "\n" : "");
}

/**
 * Parse a JSONL ledger, tolerating a torn/blank trailing line (crash resistance).
 * A malformed line is dropped, not thrown on — a single bad append must never
 * make a device's whole ledger unreadable.
 */
export function parseOps(text: string): Op[] {
  const ops: Op[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      ops.push(JSON.parse(trimmed) as Op);
    } catch {
      // torn/corrupt line (e.g. an interrupted append) — skip it
    }
  }
  return ops;
}

export function serializeSnapshot(ops: Op[]): string {
  const snapshot: Snapshot = { v: 1, ops };
  return JSON.stringify(snapshot);
}

/** Parse a snapshot file; tolerant of an empty/corrupt file (→ no ops). */
export function parseSnapshot(text: string): Op[] {
  try {
    const parsed = JSON.parse(text) as Snapshot;
    return Array.isArray(parsed?.ops) ? parsed.ops : [];
  } catch {
    return [];
  }
}
