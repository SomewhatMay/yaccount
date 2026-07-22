import { atom } from "jotai";
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

/** Append + apply one op atomically (§0.1), then refresh the caches. */
export const dispatchAtom = atom(null, async (_get, set, op: Op) => {
  const repo = await getRepo();
  await repo.dispatch(op);
  await set(refreshAtom);
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
});
