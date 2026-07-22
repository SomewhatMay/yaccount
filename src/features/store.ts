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
import { runSync } from "@/sync";
import { getDriveFS } from "@/sync/drive";
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

export const readyAtom = atom(false);
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
 * The unified global reporting-period control (§6.1). One period drives every
 * dashboard widget (per-widget override is deferred to M11). `comparePeriodAtom`
 * holds the optional second range for two-range compare (§6.2); null = compare
 * off. These carry only the period *descriptor* — resolution to a concrete range
 * needs `today`, which the view supplies, keeping the atoms free of clock state.
 */
export const reportingPeriodAtom = atom<ReportingPeriod>({
  kind: "preset",
  preset: "last-3-months",
});
export const comparePeriodAtom = atom<ReportingPeriod | null>(null);

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

/** Append + apply one op atomically (§0.1), then refresh the caches. The op is
 * now queued in the repo outbox, so we also nudge a debounced background sync to
 * push it to Drive promptly (§8.6 — never blocking; the write already landed
 * locally). */
export const dispatchAtom = atom(null, async (_get, set, op: Op) => {
  const repo = await getRepo();
  await repo.dispatch(op);
  await set(refreshAtom);
  scheduleSync(set);
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
 * available) — shown in the indicator tooltip so a failure is diagnosable, not a
 * mystery. */
export const lastSyncErrorAtom = atom<string | null>(null);

/** Best-effort human summary of a thrown error — surfaces drivestore's
 * `DriveError.status`/`.body` (§4) so a 403/401/CORS is legible at a glance. */
function describeSyncError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { status?: number; body?: string; message?: string };
    if (typeof e.status === "number") {
      const detail = (e.body ?? e.message ?? "").toString().slice(0, 300);
      return `Drive ${e.status}${detail ? `: ${detail}` : ""}`;
    }
    if (typeof e.message === "string") return e.message;
  }
  return String(err);
}

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

  syncing = true;
  set(syncStatusAtom, "syncing");
  try {
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
    // DriveError / offline — stay usable, surface honestly (§8.6). Log the raw
    // error (it carries .status/.body) so a failing sync is diagnosable.
    console.error("[yaccount] Drive sync failed:", err);
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
  const today = new Date().toISOString().slice(0, 10);
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
  const today = new Date().toISOString().slice(0, 10);
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
  await getRepo();
  await set(refreshAtom);
  set(readyAtom, true);
  await set(runRecurringGenerationAtom);
  await set(runGoalMaintenanceAtom);
  // Kick the first Drive sync in the background — never awaited on the boot path,
  // so the network can't gate the already-rendered UI (§8.6). No-ops if signed out.
  void set(syncAtom);
});
