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
  type RecurringRule,
  type Setting,
  type Transaction,
} from "@/core/model";
import type { Op } from "@/core/oplog";
import type { ReportingPeriod } from "@/core/engine/period";
import { generateDueOccurrences } from "@/core/engine/recurring";
import { pendingRows } from "@/core/engine/ledger";
import { recordGeneratedOccurrence, updateRecurringRule } from "@/core/commands";

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
  const [cats, conts, txns, snaps, settings, budgetTargets, rules] = await Promise.all([
    repo.getAll<Category>(STORE.categories),
    repo.getAll<Container>(STORE.containers),
    repo.getAll<Transaction>(STORE.transactions),
    repo.getAll<ContainerSnapshot>(STORE.containerSnapshots),
    repo.getAll<Setting>(STORE.settings),
    repo.getAll<BudgetTarget>(STORE.budgetTargets),
    repo.getAll<RecurringRule>(STORE.recurringRules),
  ]);
  set(categoriesAtom, cats);
  set(containersAtom, conts);
  set(transactionsAtom, txns);
  set(snapshotsAtom, snaps);
  set(settingsAtom, settings);
  set(budgetTargetsAtom, budgetTargets);
  set(recurringRulesAtom, rules);
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
  for (const rule of rules) {
    const { rows, rule: advanced } = generateDueOccurrences(rule, today);
    if (rows.length === 0) continue;
    const repo = await getRepo();
    for (const row of rows) await repo.dispatch(recordGeneratedOccurrence(row));
    await repo.dispatch(updateRecurringRule(advanced));
  }
  await set(refreshAtom);
});

/** Open the repo (seeds 'general' + deviceId on first run), load, mark ready,
 * then backfill due recurring occurrences in the background (§8.6 instant-open). */
export const bootstrapAtom = atom(null, async (_get, set) => {
  await getRepo();
  await set(refreshAtom);
  set(readyAtom, true);
  await set(runRecurringGenerationAtom);
});
