import { atom, type Setter } from "jotai";
import {
  Repo,
  withGeneralWallet,
  type LedgerFocusQuery,
  type LedgerPageQuery,
  type LedgerScanQuery,
  type SearchEntryScanQuery,
} from "@/core/repo";
import { DB_VERSION, STORE } from "@/core/repo/db";
import {
  GENERAL_CONTAINER_ID,
  SETTING,
  type BudgetTarget,
  type Category,
  type Container,
  type ContainerSnapshot,
  type CravingWin,
  type Goal,
  type RecurringRule,
  type Setting,
  type Transaction,
} from "@/core/model";
import type { Op } from "@/core/oplog";
import { toast } from "sonner";
import { todayIso } from "@/features/clock";
import { markHandled } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import {
  runSync,
  runDriveReset,
  driveGeneration,
  listBackups,
  readBackupOps,
  ORIGIN_META_KEY,
  ORPHAN_META_KEY,
  type OrphanNote,
  type ResetKind,
  type RetiredFile,
} from "@/sync";
import { getDriveFS, describeSyncError } from "@/sync/drive";
import { buildExport, exportFileName, serializeExport } from "@/core/data";
import { getAuthProvider } from "@/auth/web";
import type { ReportingPeriod } from "@/core/engine/period";
import { generateDueOccurrences } from "@/core/engine/recurring";
import { requiredMonthly, type GoalLedgerFacts } from "@/core/engine/goals";
import { recordGeneratedOccurrence, updateRecurringRule } from "@/core/commands";
import { goalMaintenanceOps } from "@/features/goals/maintenance";
import { BUILD_INFO } from "@/lib/build-info";
import { operationLogFacts } from "@/lib/strategic-logging";
import type {
  EntryRead,
  LedgerContainerFact,
  LedgerUsageFact,
} from "@/core/repo/ledger-read";

/**
 * Cross-component app state lives in Jotai atoms (boilerplate-free vs. context).
 * The atoms hold a cache of the materialized tables; every mutation goes through
 * `dispatchAtom`, which runs the op-log write path in `core` and then refreshes
 * the caches. This is the UI's single seam onto the repo (impl §3); sync (M9)
 * layers onto the same repo without changing this contract.
 *
 * The `Repo` itself is a side-effectful IndexedDB handle (not rendered UI state),
 * so it is a module-level singleton, not an atom or a context.
 */

const log = createLogger("store");

export const readyAtom = atom(false);
/**
 * Why the app could not start. Boot opens IndexedDB, and that genuinely fails —
 * private browsing, a disabled storage setting, a corrupt database, another tab
 * holding an incompatible version. Before this the failure was invisible: every
 * screen sat on "Loading…" forever with no way to tell a slow disk from a dead
 * one. `AppShell` renders this instead of the shell when it is set.
 */
export const bootErrorAtom = atom<string | null>(null);
export const categoriesAtom = atom<Category[]>([]);
export const containersAtom = atom<Container[]>([]);
export const pendingEntriesAtom = atom<EntryRead[]>([]);
export const containerFactsAtom = atom<Map<string, LedgerContainerFact>>(new Map());
export const usageFactsAtom = atom<LedgerUsageFact[]>([]);
export const ledgerCountAtom = atom(0);
export const ledgerRevisionAtom = atom(0);
export const ledgerLocalAddAtom = atom<{ id: string; nonce: number } | null>(null);
export const ledgerRemoteChangeAtom = atom<{ revision: number; nonce: number } | null>(
  null,
);
export const snapshotsAtom = atom<ContainerSnapshot[]>([]);
export const settingsAtom = atom<Setting[]>([]);
export const budgetTargetsAtom = atom<BudgetTarget[]>([]);
export const recurringRulesAtom = atom<RecurringRule[]>([]);
export const goalsAtom = atom<Goal[]>([]);
export const goalFactsAtom = atom<Map<string, GoalLedgerFacts>>(new Map());
export const cravingWinsAtom = atom<CravingWin[]>([]);

/** The synced-setting key holding a month's manually-entered expected income
 * (§6.8 fallback when no income recurring rules cover the month). */
export const expectedIncomeKey = (yearMonth: string): string =>
  `expected_income:${yearMonth}`;

/** Live shortcuts (§5.8) — the is_template rows, for the ledger's quick-log strip. */
export const templatesAtom = atom<Transaction[]>([]);
/** The Inbox queue count (§5.8) — drives the nav badge. */
export const pendingCountAtom = atom((get) => get(pendingEntriesAtom).length);

/** Default Spending Container (§5.2) — the compose bar's preselected wallet.
 * A synced setting; falls back to the seeded 'general' wallet. */
export const defaultContainerIdAtom = atom((get) => {
  const setting = get(settingsAtom).find((s) => s.key === SETTING.defaultContainerId);
  const containers = get(containersAtom);
  const id = setting?.value;
  if (id && containers.some((c) => c.id === id && !c.is_archived)) return id;
  return GENERAL_CONTAINER_ID;
});

/**
 * ── The shell's two pieces of shared UI state (M11) ────────────────────────
 *
 * The quick-add sheet is opened from three places — the FAB, the ⌘K palette and
 * a keyboard shortcut — so which kind of entry it opens on is state, not a prop
 * threaded through the shell. `null` = closed.
 */
export type QuickAddKind = "expense" | "income" | "transfer";
export const quickAddAtom = atom<QuickAddKind | null>(null);

/** The ⌘K palette. Opened by the shortcut and the topbar search affordance, so,
 * likewise, state rather than a prop. */
export const commandPaletteAtom = atom(false);

/** The investment whose reported-value history is open. The sheet is global so
 * a container row and a command action share the exact same write path. */
export const reportedBalanceContainerIdAtom = atom<string | null>(null);

/** Global Cravings Savings entry sheet: new from quick actions, edit by row id. */
export const cravingWinSheetAtom = atom<"new" | string | null>(null);

/**
 * The row the register should mark, and whether to bring it into view.
 *
 * Two callers, one device: a row just logged lands with a single iris wash
 * (§12.5's one orchestrated moment — it is already at the top, so no scrolling),
 * and a row chosen from the ⌘K palette is somewhere down the page, so that one
 * scrolls. The mark is held for a moment and then released, which is why it
 * expires here rather than in a component that may have unmounted by then.
 */
export type FlashedRow = { id: string; scroll: boolean };
export const flashedRowAtom = atom<FlashedRow | null>(null);
const FLASH_MS = 1400;
let flashTimer: ReturnType<typeof setTimeout> | null = null;

export const flashRowAtom = atom(
  null,
  (_get, set, row: { id: string; scroll?: boolean } | null) => {
    if (flashTimer) clearTimeout(flashTimer);
    set(flashedRowAtom, row ? { id: row.id, scroll: row.scroll ?? false } : null);
    if (row) {
      flashTimer = setTimeout(() => set(flashedRowAtom, null), FLASH_MS);
    }
  },
);

/**
 * Reporting periods, per-widget overrides, and folds are browser-local display
 * state in `features/reports/period-pref.ts` and `prefs.ts`. Dashboard order and
 * visibility use a synced setting.
 */

let repoPromise: Promise<Repo> | null = null;
function getRepo(): Promise<Repo> {
  if (!repoPromise) {
    repoPromise = Repo.open(undefined, (event) => log.info(event.message, event.facts));
  }
  return repoPromise;
}

export async function readLedgerPage(query: LedgerPageQuery) {
  return (await getRepo()).getLedgerPage(query);
}

export async function scanLedgerEntries(query: LedgerScanQuery) {
  return (await getRepo()).scanLedgerEntries(query);
}

export async function scanSearchEntries(query: SearchEntryScanQuery) {
  return (await getRepo()).scanSearchEntries(query);
}

export async function readLedgerFocus(query: LedgerFocusQuery) {
  return (await getRepo()).getLedgerFocus(query);
}

export async function readLedgerRange(start: string, end: string) {
  return (await getRepo()).getLedgerRange(start, end);
}

export async function readApprovedTransactionRange(start: string, end: string) {
  return (await getRepo()).getApprovedTransactionRange(start, end);
}

export async function readLedgerEntriesById(ids: readonly string[]) {
  return (await getRepo()).getLedgerEntriesById(ids);
}

export async function readOverallBalanceSeries(
  containerIds: readonly string[],
  days: readonly string[],
) {
  return (await getRepo()).getOverallBalanceSeries(containerIds, days);
}

export async function readPeriodCashFlow(
  containerIds: readonly string[],
  yearMonth: string,
) {
  return (await getRepo()).getPeriodCashFlow(containerIds, yearMonth);
}

/** Re-read the materialized tables into the atoms (local-first read path). */
export const refreshAtom = atom(null, async (_get, set) => {
  const repo = await getRepo();
  const [cats, conts, ledgerRead, snaps, settings, budgetTargets, rules, goals, cravingWins] =
    await Promise.all([
      repo.getAll<Category>(STORE.categories),
      repo.getAll<Container>(STORE.containers),
      repo.getLedgerReadSnapshot(),
      repo.getAll<ContainerSnapshot>(STORE.containerSnapshots),
      repo.getAll<Setting>(STORE.settings),
      repo.getAll<BudgetTarget>(STORE.budgetTargets),
      repo.getAll<RecurringRule>(STORE.recurringRules),
      repo.getAll<Goal>(STORE.goals),
      repo.getAll<CravingWin>(STORE.cravingWins),
    ]);
  const containerFacts = new Map(
    ledgerRead.containerFacts.map((fact) => [fact.containerId, fact]),
  );
  const goalFacts = new Map(
    await Promise.all(
      goals.map(async (goal) => [
        goal.id,
        {
          balance: containerFacts.get(goal.container_id)?.balance ?? 0,
          netContribution: await repo.getContainerTransferContribution(
            goal.container_id,
            goal.created_date,
          ),
        } satisfies GoalLedgerFacts,
      ] as const),
    ),
  );
  set(categoriesAtom, cats);
  set(containersAtom, conts);
  set(pendingEntriesAtom, ledgerRead.pending);
  set(templatesAtom, ledgerRead.templates);
  set(containerFactsAtom, containerFacts);
  set(usageFactsAtom, ledgerRead.usageFacts);
  set(ledgerCountAtom, ledgerRead.ledgerCount);
  set(ledgerRevisionAtom, ledgerRead.revision);
  set(snapshotsAtom, snaps);
  set(settingsAtom, settings);
  set(budgetTargetsAtom, budgetTargets);
  set(recurringRulesAtom, rules);
  set(goalsAtom, goals);
  set(goalFactsAtom, goalFacts);
  set(cravingWinsAtom, cravingWins);
});

/**
 * Append + apply one op atomically (§0.1), then refresh the caches. The op is
 * now queued in the repo outbox, so we also nudge a debounced background sync to
 * push it to Drive promptly (§8.6 — never blocking; the write already landed
 * locally).
 *
 * Failure is reported HERE, once, rather than at ~40 call sites: a write can fail
 * for reasons the user can act on (storage full, private-browsing quota, a tab
 * holding an old DB version) and silently swallowing it would leave them
 * believing a transaction was recorded. It then RETHROWS, marked as handled, so
 * the caller skips its success path — the form keeps what was typed instead of
 * clearing it, and no "Logged" toast fires — while the global handler stays
 * quiet about an error the user has already been shown.
 */
export const dispatchAtom = atom(null, async (_get, set, op: Op) => {
  const startedAt = Date.now();
  const facts = operationLogFacts([op]);
  log.info("write started", facts);
  try {
    const repo = await getRepo();
    await repo.dispatch(op);
    await set(refreshAtom);
    if (
      op.type === "transaction.create" &&
      op.payload.row.inbox_status === "approved" &&
      !op.payload.row.is_template
    ) {
      set(ledgerLocalAddAtom, { id: op.payload.row.id, nonce: Date.now() });
    }
    scheduleSync(set);
    log.info("write succeeded", { ...facts, durationMs: Date.now() - startedAt });
  } catch (err) {
    const summary = log.capture(`dispatch ${op.type} failed`, err);
    toast.error("Couldn't save that change.", { description: summary });
    throw markHandled(err);
  }
});

/** Commit a multi-op user intent in one IndexedDB transaction. */
export const dispatchManyAtom = atom(null, async (_get, set, ops: Op[]) => {
  const startedAt = Date.now();
  const facts = operationLogFacts(ops);
  log.info("write started", facts);
  try {
    const repo = await getRepo();
    await repo.dispatchMany(ops);
    await set(refreshAtom);
    scheduleSync(set);
    log.info("write succeeded", { ...facts, durationMs: Date.now() - startedAt });
  } catch (err) {
    const summary = log.capture("dispatch batch failed", err);
    toast.error("Couldn't save that change.", { description: summary });
    throw markHandled(err);
  }
});

/**
 * ── Drive sync status (M9, §8.4/§8.6) ──────────────────────────────────────
 * `idle` — not connected (nothing to sync); `syncing` — a cycle is in flight;
 * `synced` — last cycle succeeded; `disconnected` — connected but the token needs
 * an interactive reconnect (silent renewal failed, §3.3-B); `error` — a Drive/
 * network failure (the app stays fully usable, §8.6). Instant-open is unaffected:
 * boot never waits on any of this.
 */
export type SyncStatus = "idle" | "syncing" | "synced" | "disconnected" | "error";
export const syncStatusAtom = atom<SyncStatus>("idle");
export const lastSyncedAtAtom = atom<number | null>(null);
/** Human-readable detail of the last sync failure (DriveError status+body when
 * available, formatted by the sync seam) — shown in the indicator tooltip so a
 * failure is diagnosable, not a mystery. */
export const lastSyncErrorAtom = atom<string | null>(null);

// Guard against overlapping cycles (the boot kick, the interval, and the
// post-edit debounce can all fire close together). A skipped run is fine — the
// next tick picks up whatever changed (every step is idempotent).
let syncing = false;
let syncDebounce: ReturnType<typeof setTimeout> | null = null;

/** Debounce a background sync after local edits so a burst of dispatches results
 * in one push, not one per op. */
function scheduleSync(set: Setter): void {
  if (syncDebounce) clearTimeout(syncDebounce);
  syncDebounce = setTimeout(() => {
    void set(syncAtom);
  }, 1500);
}

/**
 * One background sync cycle (§8.4/§8.5): pull the snapshot + all device ledgers,
 * merge them into local state under the total order, push this device's queued
 * ops to its own ledger, collapse/truncate as needed. Pre-gates on a SILENT token
 * (no popup on a background tick, §3.3-B): if the account is connected but the
 * token can't be renewed silently, surface `disconnected` so the UI can offer an
 * interactive reconnect. Never throws — a Drive failure leaves the app usable.
 */
export const syncAtom = atom(null, async (_get, set) => {
  if (syncing) return;
  // Claim the guard SYNCHRONOUSLY, before any await, so near-simultaneous
  // triggers (a tab refocus fires both `visibilitychange` and `focus`) can't both
  // slip past into overlapping cycles.
  syncing = true;
  let startedAt: number | null = null;
  try {
    const auth = getAuthProvider();
    if (!auth.isConnected()) {
      set(syncStatusAtom, "idle"); // signed out — the sign-in control drives onboarding
      return;
    }
    let token: string | null = null;
    try {
      token = await auth.getAccessTokenSilent();
    } catch {
      token = null;
    }
    if (!token) {
      set(syncStatusAtom, "disconnected");
      return;
    }

    set(syncStatusAtom, "syncing");
    startedAt = Date.now();
    log.info("sync started");
    const repo = await getRepo();
    const deviceId = await repo.getDeviceId();
    const fs = getDriveFS();
    const yearMonth = new Date().toISOString().slice(0, 7);
    const result = await runSync({
      fs,
      deviceId,
      listOps: () => repo.listOps(),
      applyRemoteOps: (ops) => repo.applyRemoteOps(ops),
      getOutboxOps: () => repo.getOutboxOps(),
      clearOutbox: (ids) => repo.clearOutbox(ids),
      yearMonth,
      generation: driveGeneration({
        fs,
        repo,
        deviceId,
        now: () => new Date().toISOString(),
      }),
    });
    await set(refreshAtom); // re-derive the UI from the merged state (§8.6)
    if (result.rebuilt) {
      const repoSnapshot = await repo.getLedgerReadSnapshot();
      set(ledgerRemoteChangeAtom, {
        revision: repoSnapshot.revision,
        nonce: Date.now(),
      });
    }

    // This device just discovered the account was cleared or replaced somewhere
    // else. Its own data was set aside rather than dropped, and saying so is not
    // optional — a silent set-aside reads exactly like a silent loss (§0.3).
    if (result.adopted) {
      set(orphanNoteAtom, {
        path: result.adopted.path,
        at: result.adopted.resetAt,
        kind: result.adopted.kind,
        opCount: result.adopted.opCount,
      });
      toast.message("This account was reset on another device.", {
        description:
          "What was on this device has been set aside — you can download or restore it from Settings.",
        duration: 12_000,
      });
    }
    set(lastSyncedAtAtom, Date.now());
    set(lastSyncErrorAtom, null);
    set(syncStatusAtom, "synced");
    log.info("sync succeeded", {
      durationMs: Date.now() - startedAt,
      pushed: result.pushed,
      collapsed: result.collapsed,
      rebuilt: result.rebuilt,
      adopted: Boolean(result.adopted),
    });
  } catch (err) {
    // DriveError / offline — stay usable, surface honestly (§8.6). The sync seam
    // knows drivestore's error shape, so it writes the user-facing line; the log
    // keeps the full stack for whoever has to diagnose it.
    log.capture(
      startedAt === null
        ? "Drive sync failed"
        : `Drive sync failed after ${Date.now() - startedAt}ms`,
      err,
    );
    set(lastSyncErrorAtom, describeSyncError(err));
    set(syncStatusAtom, "error");
  } finally {
    syncing = false;
  }
});

/**
 * Interactive reconnect (§3.3-B): a user gesture re-consents when a silent
 * renewal has failed (`disconnected`). Must be called from a click handler — it
 * may open the GIS popup. On success it immediately runs a sync.
 */
export const reconnectAtom = atom(null, async (_get, set) => {
  try {
    await getAuthProvider().getAccessToken(); // interactive — needs the gesture
  } catch {
    set(syncStatusAtom, "disconnected");
    return;
  }
  await set(syncAtom);
});

/**
 * ── Data tools (Settings → Your data, post-M11 phase 5) ────────────────────
 *
 * Export, import, clear and roll back — across BOTH stores, because a tool that
 * only clears this device would be undone by the next sync tick pulling Drive
 * back down. The ordering rule is the same everywhere: Drive is committed first
 * (`runDriveReset`, whose own last write is the generation marker), then local
 * state is replaced in one IndexedDB transaction. A failure on the Drive side
 * therefore changes nothing anywhere, and a failure after it self-heals — this
 * device simply adopts its own reset on the next tick.
 */

/** Set when this device adopted a reset made elsewhere and its data was set
 * aside. Surfaces the §1.1 visible inverse: the notice carries the way back. */
export const orphanNoteAtom = atom<OrphanNote | null>(null);

/** Retired worlds on Drive, newest first. `null` until loaded. */
export const backupsAtom = atom<RetiredFile[] | null>(null);

export interface DataFile {
  name: string;
  text: string;
}

/** Everything this device holds, in the versioned portable format. */
export const exportDataAtom = atom(null, async (): Promise<DataFile> => {
  const repo = await getRepo();
  const [ops, deviceId] = await Promise.all([repo.listOps(), repo.getDeviceId()]);
  const exportedAt = new Date().toISOString();
  return {
    name: exportFileName(exportedAt),
    text: serializeExport(buildExport({ ops, exportedAt, deviceId })),
  };
});

/**
 * Install `ops` as the entire world, on Drive and on this device.
 *
 * When the account is connected, Drive is authoritative and goes first — if it
 * throws, this returns having changed nothing at all, which is what makes an
 * invalid or interrupted import a no-op rather than a half-state.
 *
 * When it is NOT connected we deliberately record no generation. This device has
 * still never synced, so a later first connect must MERGE its data into whatever
 * is on Drive rather than adopt-and-discard it — the same rule that protects the
 * long-standing "work offline, then connect" flow.
 */
async function installWorld(set: Setter, ops: Op[], kind: ResetKind): Promise<void> {
  const startedAt = Date.now();
  const repo = await getRepo();
  const world = withGeneralWallet(ops);
  const auth = getAuthProvider();
  const connected = auth.isConnected();
  const facts = { kind, ...operationLogFacts(world), drive: connected };
  log.info("data replacement started", facts);

  const meta: { key: string; value: unknown }[] = [];
  if (connected) {
    // Always reached from a click, so an interactive re-consent is legitimate
    // here — unlike a background tick, which must stay silent (§3.3-B).
    await auth.getAccessToken();
    const resetId = crypto.randomUUID();
    await runDriveReset({
      fs: getDriveFS(),
      ops: world,
      kind,
      resetId,
      now: new Date().toISOString(),
    });
    meta.push({ key: ORIGIN_META_KEY, value: { resetId } });
  }

  await repo.resetTo(world, { meta });
  await set(refreshAtom);
  if (connected) {
    set(lastSyncedAtAtom, Date.now());
    set(lastSyncErrorAtom, null);
    set(syncStatusAtom, "synced");
  }
  set(backupsAtom, null); // the list just gained an entry — reload it on demand
  log.info("data replacement succeeded", {
    ...facts,
    durationMs: Date.now() - startedAt,
  });
}

/** Stop using everything. Nothing is destroyed: the previous world is retired to
 * Drive first and stays restorable from the backup list. */
export const clearAllDataAtom = atom(null, async (_get, set) => {
  await installWorld(set, [], "clear");
});

/** Replace everything with a validated export's ops (never call with unchecked
 * input — `validateExport` is the gate, and it runs before anything is written). */
export const importDataAtom = atom(null, async (_get, set, ops: Op[]) => {
  await installWorld(set, ops, "import");
});

/** Roll the account back to a retired world. The rollback is itself backed up
 * first, so it too has an inverse (§1.1). */
export const restoreBackupAtom = atom(null, async (_get, set, name: string) => {
  const ops = await readBackupOps(getDriveFS(), name);
  await installWorld(set, ops, "restore");
});

/** Load the restore points. Silent-token gated: this runs on panel mount, which
 * is not a user gesture, so it must never be able to raise a popup. */
export const loadBackupsAtom = atom(null, async (_get, set) => {
  const auth = getAuthProvider();
  if (!auth.isConnected()) return set(backupsAtom, []);
  const token = await auth.getAccessTokenSilent().catch(() => null);
  if (!token) return set(backupsAtom, []);
  set(backupsAtom, await listBackups(getDriveFS()));
});

/** A retired world as a downloadable file, in the same importable envelope. */
export const readBackupAtom = atom(
  null,
  async (_get, _set, name: string): Promise<DataFile> => {
    const ops = await readBackupOps(getDriveFS(), name);
    return {
      name: `yaccount-${name.replace(/\.json$/, "")}.json`,
      text: serializeExport(buildExport({ ops, exportedAt: new Date().toISOString() })),
    };
  },
);

/** Acknowledge the set-aside notice. The orphan file itself stays on Drive. */
export const dismissOrphanAtom = atom(null, async (_get, set) => {
  const repo = await getRepo();
  await repo.setMeta(ORPHAN_META_KEY, null);
  set(orphanNoteAtom, null);
});

/**
 * Generate any recurring occurrences that came due while the app was closed
 * (§5.8 backfill). Runs after boot, over the loaded rules; each occurrence is a
 * deterministic-id pending row (idempotent regen) and the rule's cursor advances,
 * so re-running is a no-op. `today` is read here (the clock lives in the UI layer,
 * never in `core`). Dispatches go through the same op-log path as any mutation.
 */
export const runRecurringGenerationAtom = atom(null, async (get, set) => {
  const today = todayIso();
  const rules = get(recurringRulesAtom).filter((r) => r.status === "active");
  const goals = get(goalsAtom);
  const goalFacts = get(goalFactsAtom);
  for (const rule of rules) {
    // A goal_derived rule logs the linked goal's CURRENT required_monthly (§5.9.5),
    // recomputed here at generation time so a deadline goal's drifting ask never
    // logs stale. A resolved $0 (funded/done) generates nothing.
    let opts: { goalDerivedAmount?: number } | undefined;
    if (rule.amount_mode === "goal_derived" && rule.linked_goal_id) {
      const goal = goals.find((g) => g.id === rule.linked_goal_id);
      opts = goal
        ? {
            goalDerivedAmount: requiredMonthly(
              goal,
              goalFacts.get(goal.id) ?? { balance: 0, netContribution: 0 },
              today,
            ),
          }
        : undefined;
    }
    const { rows, rule: advanced } = generateDueOccurrences(rule, today, opts);
    // Advance the cursor even when nothing was logged (a goal_derived $0), so the
    // rule doesn't re-evaluate the same window forever.
    if (rows.length === 0 && advanced.next_generation_date === rule.next_generation_date)
      continue;
    const repo = await getRepo();
    for (const row of rows) await repo.dispatch(recordGeneratedOccurrence(row));
    await repo.dispatch(updateRecurringRule(advanced));
  }
  await set(refreshAtom);
});

/**
 * Auto-complete achieved goals (§5.9.6). A `spend_down` goal completes and closes
 * once `contributed ≥ target` — status latches to completed and its linked
 * recurring rule cancels so it stops generating. A `reserve` goal never latches
 * (it oscillates), so `isAchieved` returns false for it. Runs at boot, after
 * generation, over approved contributions only.
 */
export const runGoalMaintenanceAtom = atom(null, async (get, set) => {
  const today = todayIso();
  const goalFacts = get(goalFactsAtom);
  const rules = get(recurringRulesAtom);
  const goals = get(goalsAtom);
  const repo = await getRepo();
  const ops = goalMaintenanceOps(goals, goalFacts, rules, today);
  if (ops.length === 0) return;
  await repo.dispatchMany(ops);
  await set(refreshAtom);
});

/** Open the repo (seeds 'general' + deviceId on first run), load, mark ready,
 * then backfill due recurring occurrences + settle achieved goals in the
 * background (§8.6 instant-open). */
export const bootstrapAtom = atom(null, async (_get, set) => {
  const startedAt = Date.now();
  log.info("app boot started", {
    version: BUILD_INFO.version,
    build: BUILD_INFO.shortSha,
    schemaVersion: DB_VERSION,
  });
  // Opening the DB and loading it is the ONLY part that can leave the app
  // unusable, so it is the only part that sets bootError.
  try {
    const repo = await getRepo();
    await set(refreshAtom);
    set(readyAtom, true);
    // A set-aside from a previous session must survive a reload — the notice is
    // the only route back to that data, so it persists until acknowledged.
    set(orphanNoteAtom, (await repo.getMeta<OrphanNote>(ORPHAN_META_KEY)) ?? null);
    log.info("app boot succeeded", { durationMs: Date.now() - startedAt });
  } catch (err) {
    set(bootErrorAtom, log.capture("could not open the local database", err));
    return;
  }

  // The two background passes are conveniences. A bug in either used to take the
  // whole boot down with it; now each fails on its own and the ledger still opens.
  for (const [what, task] of [
    ["recurring generation", runRecurringGenerationAtom],
    ["goal maintenance", runGoalMaintenanceAtom],
  ] as const) {
    try {
      await set(task);
    } catch (err) {
      log.capture(`${what} failed`, err);
    }
  }

  // Kick the first Drive sync in the background — never awaited on the boot path,
  // so the network can't gate the already-rendered UI (§8.6). No-ops if signed out.
  void set(syncAtom);
});
