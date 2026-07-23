import { constrains, matchesWords, terms } from "@/core/engine/filter";
import type { Goal, GoalKind } from "@/core/model";

/**
 * The goals list, narrowed and ordered.
 *
 * Goals are not transactions, so this is its own small predicate rather than a
 * `TransactionFilter` bent into a shape it wasn't built for — that is how one
 * good rule becomes five bad ones. What IS shared is the *meaning* of the
 * controls: `terms`/`matchesWords`/`constrains` come from the engine, so typing
 * narrows and an emptied facet means "all" on every screen alike.
 *
 * Pure and clock-free: anything derived (progress, a container's name) arrives
 * through the context, because the view already computed it.
 */

/** Where a goal actually sits on the screen. */
export type GoalState = "active" | "completed" | "cancelled" | "archived";

/**
 * Archiving wins over status: an archived goal is in the Archived section
 * whatever its status was, so the facet has to name where the row IS, not what
 * happened to it last.
 */
export function goalState(goal: Goal): GoalState {
  return goal.is_archived ? "archived" : goal.status;
}

export interface GoalFilter {
  text?: string;
  states?: GoalState[];
  kinds?: GoalKind[];
}

export interface GoalContext {
  /** Extra searchable text — a nameless goal shows its container's name, and the
   *  search box has to look at what is on the screen. */
  label?: (goal: Goal) => string;
}

export function matchesGoal(
  goal: Goal,
  filter: GoalFilter,
  ctx: GoalContext = {},
): boolean {
  const words = terms(filter.text);
  if (!matchesWords(`${goal.name ?? ""} ${ctx.label?.(goal) ?? ""}`, words)) return false;
  if (constrains(filter.states) && !filter.states.includes(goalState(goal))) return false;
  if (constrains(filter.kinds) && !filter.kinds.includes(goal.kind)) return false;
  return true;
}

export function applyGoalFilter(
  goals: Goal[],
  filter: GoalFilter,
  ctx: GoalContext = {},
): Goal[] {
  return goals.filter((g) => matchesGoal(g, filter, ctx));
}

export function activeGoalFilterCount(filter: GoalFilter): number {
  let n = 0;
  if (terms(filter.text).length > 0) n += 1;
  if (constrains(filter.states)) n += 1;
  if (constrains(filter.kinds)) n += 1;
  return n;
}

export const GOAL_SORTS = ["name", "progress", "deadline"] as const;
export type GoalSort = (typeof GOAL_SORTS)[number];

/** Whether a stored preference is one this build still knows how to render. */
export function isGoalSort(value: string): value is GoalSort {
  return (GOAL_SORTS as readonly string[]).includes(value);
}

export interface GoalSortContext {
  label: (goal: Goal) => string;
  /** How far along, 0…1+, or null when the goal has nothing to be far along. */
  progress: (goal: Goal) => number | null;
}

/**
 * Goals in the order the reader asked for. Returns a new array.
 *
 * A goal with nothing to measure sinks to the end of whichever ranking it can't
 * answer — no deadline is not "due first", it is not due at all. Ties fall back
 * to the name and then the id, so two devices always agree (§8.5).
 */
export function sortGoals(goals: Goal[], order: GoalSort, ctx: GoalSortContext): Goal[] {
  const byName = (a: Goal, b: Goal) =>
    ctx.label(a).localeCompare(ctx.label(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  return [...goals].sort((a, b) => {
    if (order === "progress") {
      const pa = ctx.progress(a);
      const pb = ctx.progress(b);
      if (pa === null || pb === null) {
        if (pa !== pb) return pa === null ? 1 : -1;
      } else if (pa !== pb) return pb - pa;
      return byName(a, b);
    }
    if (order === "deadline") {
      const da = a.deadline;
      const db = b.deadline;
      if (da === null || db === null) {
        if (da !== db) return da === null ? 1 : -1;
      } else if (da !== db) return da < db ? -1 : 1;
      return byName(a, b);
    }
    return byName(a, b);
  });
}
