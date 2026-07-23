import { atom, type Setter } from "jotai";
import { Repo } from "@/core/repo";
import { STORE } from "@/core/repo/db";
import {
  GENERAL_CONTAINER_ID,
  SETTING,
  type BudgetTarget,
  type Category,
  type Container,
  type ContainerSnapshot,
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
import { runSync } from "@/sync";
import { getDriveFS, describeSyncError } from "@/sync/drive";
import { getAuthProvider } from "@/auth/web";
import type { ReportingPeriod } from "@/core/engine/period";
import { generateDueOccurrences } from "@/core/engine/recurring";
import { requiredMonthly, isAchieved } from "@/core/engine/goals";
import { pendingRows } from "@/core/engine/ledger";
import {
  cancelRecurringRule,
  completeGoal,
  recordGeneratedOccurrence,
  updateRecurringRule,
} from "@/core/commands";

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
export const transactionsAtom = atom<Transaction[]>([]);
export const snapshotsAtom = atom<ContainerSnapshot[]>([]);
export const settingsAtom = atom<Setting[]>([]);
export const budgetTargetsAtom = atom<BudgetTarget[]>([]);
export const recurringRulesAtom = atom<RecurringRule[]>([]);
export const goalsAtom = atom<Goal[]>([]);

/** The synced-setting key holding a month's manually-entered expected income
 * (§6.8 fallback when no income recurring rules cover the month). */
export const expectedIncomeKey = (yearMonth: string): string =>
  `expected_income:${yearMonth}`;

/** Live shortcuts (§5.8) — the is_template rows, for the ledger's quick-log strip. */
export const templatesAtom = atom((get) =>
  get(transactionsAtom).filter((t) => t.is_template),
);
/** The Inbox queue count (§5.8) — drives the nav badge. */
export const pendingCountAtom = atom((get) => pendingRows(get(transactionsAtom)).length);

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

/** The ⌘K palette. Opened by the shortcut, by the top bar's search affordance,
 * and from the More sheet — so, likewise, state rather than a prop. */
export const commandPaletteAtom = atom(false);

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
 * The reporting period (§6.1) used to live here as two plain atoms, which meant
 * it reset on every refresh — you chose a window, reloaded, and were quietly
 * looking at a different one. It is a device-local VIEW preference, so M11 moved
 * it to `features/reports/period-pref.ts` over `prefs.ts` (localStorage,
 * `useSyncExternalStore`) alongside the per-widget overrides and folds, which are
 * keyed the same way. Nothing about a period belongs in the synced op log.
 */

let repoPromise: Promise<Repo> | null = null;
function getRepo(): Promise<Repo> {
  if (!repoPromise) repoPromise = Repo.open();
  return repoPromise;
}

/** Re-read the materialized tables into the atoms (local-first read path). */
export const refreshAtom = atom(null, async (_get, set) => {
  const repo = await getRepo();
  const [cats, conts, txns, snaps, settings, budgetTargets, rules, goals] =
    await Promise.all([
      repo.getAll<Category>(STORE.categories),
      repo.getAll<Container>(STORE.containers),
      repo.getAll<Transaction>(STORE.transactions),
      repo.getAll<ContainerSnapshot>(STORE.containerSnapshots),
      repo.getAll<Setting>(STORE.settings),
      repo.getAll<BudgetTarget>(STORE.budgetTargets),
      repo.getAll<RecurringRule>(STORE.recurringRules),
      repo.getAll<Goal>(STORE.goals),
    ]);
  set(categoriesAtom, cats);
  set(containersAtom, conts);
  set(transactionsAtom, txns);
  set(snapshotsAtom, snaps);
  set(settingsAtom, settings);
  set(budgetTargetsAtom, budgetTargets);
  set(recurringRulesAtom, rules);
  set(goalsAtom, goals);
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
  try {
    const repo = await getRepo();
    await repo.dispatch(op);
    await set(refreshAtom);
    scheduleSync(set);
  } catch (err) {
    const summary = log.capture(`dispatch ${op.type} failed`, err);
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
    const repo = await getRepo();
    const deviceId = await repo.getDeviceId();
    const yearMonth = new Date().toISOString().slice(0, 7);
    await runSync({
      fs: getDriveFS(),
      deviceId,
      listOps: () => repo.listOps(),
      applyRemoteOps: (ops) => repo.applyRemoteOps(ops),
      getOutboxOps: () => repo.getOutboxOps(),
      clearOutbox: (ids) => repo.clearOutbox(ids),
      yearMonth,
    });
    await set(refreshAtom); // re-derive the UI from the merged state (§8.6)
    set(lastSyncedAtAtom, Date.now());
    set(lastSyncErrorAtom, null);
    set(syncStatusAtom, "synced");
  } catch (err) {
    // DriveError / offline — stay usable, surface honestly (§8.6). The sync seam
    // knows drivestore's error shape, so it writes the user-facing line; the log
    // keeps the full stack for whoever has to diagnose it.
    log.capture("Drive sync failed", err);
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
  const txns = get(transactionsAtom);
  for (const rule of rules) {
    // A goal_derived rule logs the linked goal's CURRENT required_monthly (§5.9.5),
    // recomputed here at generation time so a deadline goal's drifting ask never
    // logs stale. A resolved $0 (funded/done) generates nothing.
    let opts: { goalDerivedAmount?: number } | undefined;
    if (rule.amount_mode === "goal_derived" && rule.linked_goal_id) {
      const goal = goals.find((g) => g.id === rule.linked_goal_id);
      opts = goal ? { goalDerivedAmount: requiredMonthly(goal, txns, today) } : undefined;
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
  const txns = get(transactionsAtom);
  const rules = get(recurringRulesAtom);
  const goals = get(goalsAtom).filter((g) => g.status === "active" && !g.is_archived);
  const repo = await getRepo();
  let changed = false;
  for (const goal of goals) {
    if (!isAchieved(goal, txns)) continue;
    await repo.dispatch(completeGoal(goal.id, today));
    for (const r of rules) {
      if (r.linked_goal_id === goal.id && r.status === "active") {
        await repo.dispatch(cancelRecurringRule(r.id));
      }
    }
    changed = true;
  }
  if (changed) await set(refreshAtom);
});

/** Open the repo (seeds 'general' + deviceId on first run), load, mark ready,
 * then backfill due recurring occurrences + settle achieved goals in the
 * background (§8.6 instant-open). */
export const bootstrapAtom = atom(null, async (_get, set) => {
  // Opening the DB and loading it is the ONLY part that can leave the app
  // unusable, so it is the only part that sets bootError.
  try {
    await getRepo();
    await set(refreshAtom);
    set(readyAtom, true);
    log.info("repo ready");
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
