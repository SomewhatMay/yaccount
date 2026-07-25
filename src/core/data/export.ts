import {
  compareOps,
  applyOp,
  MemoryTx,
  newMemoryState,
  isKnownOpType,
  type Op,
} from "../oplog";
import { STATE_STORES, STORE, DB_VERSION, type StoreName } from "../repo/db";
import { isIsoDateTime } from "../model/primitives";
import { CategorySchema } from "../model/category";
import { ContainerSchema } from "../model/container";
import { BudgetTargetSchema } from "../model/budgetTarget";
import { TransactionSchema } from "../model/transaction";
import { ContainerSnapshotSchema } from "../model/containerSnapshot";
import { RecurringRuleSchema } from "../model/recurringRule";
import { GoalSchema } from "../model/goal";
import { SettingSchema } from "../model/setting";

/**
 * The portable form of a yaccount account (post-M11 phase 5).
 *
 * The payload is the **op journal**, not a dump of the materialized tables.
 * State *is* `replay(listOps())` (§0.1/§8.2), so the journal is the only
 * representation that restores identical state while keeping the op-log/replay
 * invariant intact — and it is the same primitive `snapshot.json` already uses,
 * so import, sync merge and collapse all speak one language.
 *
 * `deviceId` is provenance only and is deliberately NEVER restored: two devices
 * sharing a ledger name would break the §8.4 "no two devices write the same
 * file" guarantee, which is the whole basis of the no-lost-write design.
 *
 * Device-local view preferences (sort order, folded widgets) are deliberately
 * NOT here. `prefs.ts` states the rule — a sort order is not a fact about your
 * money — and syncing one device's reading habits into another is exactly what
 * that decision rejects.
 */
export const EXPORT_FORMAT = "yaccount.export";
export const EXPORT_VERSION = 1;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  /** ISO instant the file was written. */
  exportedAt: string;
  /** The IndexedDB schema version in force at export time — informational. */
  appDbVersion: number;
  /** Which device wrote it. Provenance only; never restored. */
  deviceId: string | null;
  /** Ops carried. A disagreement with `ops.length` means a truncated file. */
  opCount: number;
  ops: Op[];
}

export function buildExport(input: {
  ops: Op[];
  exportedAt: string;
  deviceId?: string | null;
  appDbVersion?: number;
}): ExportFile {
  // Sorted here so a file is byte-identical for identical content regardless of
  // how the caller read it — and so a reviewer can diff two exports.
  const ops = [...input.ops].sort(compareOps);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: input.exportedAt,
    appDbVersion: input.appDbVersion ?? DB_VERSION,
    deviceId: input.deviceId ?? null,
    opCount: ops.length,
    ops,
  };
}

/** Pretty-printed: an export is something a person may open and read. */
export function serializeExport(file: ExportFile): string {
  return JSON.stringify(file, null, 2);
}

export function exportFileName(exportedAt: string): string {
  return `yaccount-export-${exportedAt.slice(0, 10)}.json`;
}

export type ExportValidation =
  { ok: true; file: ExportFile; ops: Op[] } | { ok: false; errors: string[] };

/** The zod table schema guarding each materialized store (§5). */
const ROW_SCHEMA: Record<string, { safeParse: (v: unknown) => SafeParse }> = {
  [STORE.categories]: CategorySchema,
  [STORE.containers]: ContainerSchema,
  [STORE.budgetTargets]: BudgetTargetSchema,
  [STORE.transactions]: TransactionSchema,
  [STORE.containerSnapshots]: ContainerSnapshotSchema,
  [STORE.recurringRules]: RecurringRuleSchema,
  [STORE.goals]: GoalSchema,
  [STORE.settings]: SettingSchema,
};

interface SafeParse {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}

const fail = (errors: string[]): ExportValidation => ({ ok: false, errors });

const rowKey = (row: unknown): string => {
  const r = row as { id?: unknown; key?: unknown };
  const k = r?.id ?? r?.key;
  return typeof k === "string" ? k : "(unnamed row)";
};

/**
 * Decide whether a file can be imported — WITHOUT touching IndexedDB or Drive.
 *
 * An import replaces everything, everywhere, so a half-understood file is the
 * one thing that must never reach a write path (§0.3: never silently lose or
 * overwrite financial data). Validation therefore goes all the way: envelope,
 * then every op's shape, then a **full replay into throwaway memory**, then every
 * resulting row against its table schema. Only a file that survives all four is
 * `ok`. Everything else returns errors and changes nothing.
 *
 * Errors are collected per stage and reported together, naming the offending row
 * — an import that fails with "something was wrong" is not actionable.
 */
export async function validateExport(text: string): Promise<ExportValidation> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail(["That file is not valid JSON, so it could not be read."]);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return fail(["That file is not a yaccount export."]);
  }

  const file = parsed as Record<string, unknown>;
  if (file.format !== EXPORT_FORMAT) {
    return fail(["That file is not a yaccount export."]);
  }

  const version = file.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return fail(["That export does not say which format version it uses."]);
  }
  if (version > EXPORT_VERSION) {
    return fail([
      `That export was written by a newer version of yaccount (format ${version}, this build reads ${EXPORT_VERSION}). Update yaccount, then import it.`,
    ]);
  }

  const rawOps = file.ops;
  if (!Array.isArray(rawOps)) {
    return fail(["That export carries no list of changes to restore."]);
  }
  if (file.opCount !== undefined) {
    if (typeof file.opCount !== "number" || file.opCount !== rawOps.length) {
      return fail([
        `That export looks incomplete: it says it holds ${String(file.opCount)} changes but carries ${rawOps.length}.`,
      ]);
    }
  }

  // ── Stage 2: every op's shape, and no id used twice ───────────────────────
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of rawOps.entries()) {
    const where = `Change ${i + 1}`;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      errors.push(`${where} is not a change record.`);
      continue;
    }
    const op = raw as Record<string, unknown>;
    if (typeof op.id !== "string" || op.id.trim() === "") {
      errors.push(`${where} has no id.`);
    } else if (seen.has(op.id)) {
      errors.push(`The same change appears twice: ${op.id}.`);
    } else {
      seen.add(op.id);
    }
    if (typeof op.ts !== "string" || !isIsoDateTime(op.ts)) {
      errors.push(`${where} has an invalid timestamp.`);
    }
    if (!isKnownOpType(op.type)) {
      errors.push(`${where} uses an unknown change type "${String(op.type)}".`);
    }
    if (typeof op.payload !== "object" || op.payload === null) {
      errors.push(`${where} has no payload.`);
    }
  }
  if (errors.length > 0) return fail(errors);

  // ── Stage 3: prove it replays, naming the op that doesn't ─────────────────
  const ops = [...(rawOps as Op[])].sort(compareOps);
  const state = newMemoryState();
  const tx = new MemoryTx(state);
  for (const op of ops) {
    try {
      await applyOp(tx, op);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return fail([`Change ${op.id} could not be replayed: ${detail}`]);
    }
  }

  // ── Stage 4: every row the replay produced must satisfy its table schema ──
  for (const store of STATE_STORES) {
    const schema = ROW_SCHEMA[store];
    if (!schema) continue;
    for (const row of await tx.getAll<unknown>(store as StoreName)) {
      const result = schema.safeParse(row);
      if (result.success) continue;
      const issue = result.error?.issues[0];
      const at = issue?.path.length ? ` (${issue.path.join(".")})` : "";
      errors.push(
        `A row in ${store} is not valid: ${rowKey(row)}${at} — ${issue?.message ?? "unknown problem"}.`,
      );
    }
  }
  if (errors.length > 0) return fail(errors);

  return {
    ok: true,
    ops,
    file: {
      format: EXPORT_FORMAT,
      version,
      exportedAt: typeof file.exportedAt === "string" ? file.exportedAt : "",
      appDbVersion: typeof file.appDbVersion === "number" ? file.appDbVersion : 0,
      deviceId: typeof file.deviceId === "string" ? file.deviceId : null,
      opCount: ops.length,
      ops,
    },
  };
}
