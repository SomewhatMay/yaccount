import { constrains, matchesWords, terms } from "@/core/engine/filter";
import type { Category, CategoryType } from "@/core/model";

/**
 * The categories list, narrowed and ordered. Its own predicate, over the shared
 * meaning of the controls.
 *
 * A budget is time-variant (§5.3) — a category doesn't *have* one, it has one
 * *on a date* — so the resolved figure arrives through the context from the view
 * that already resolved it for today. The predicate stays clock-free.
 */

export type BudgetState = "budgeted" | "unbudgeted";
export type CategoryState = "active" | "archived";

export interface CategoryFilter {
  text?: string;
  types?: CategoryType[];
  budgets?: BudgetState[];
  states?: CategoryState[];
}

export interface CategoryContext {
  /** The budget in effect today, or null where none is set. */
  budget?: (category: Category) => number | null;
}

export function matchesCategory(
  category: Category,
  filter: CategoryFilter,
  ctx: CategoryContext = {},
): boolean {
  if (!matchesWords(category.name, terms(filter.text))) return false;
  if (constrains(filter.types) && !filter.types.includes(category.type)) return false;
  if (constrains(filter.budgets)) {
    // Nought is a decision; absence is not. A category budgeted at $0 has been
    // thought about, so it reads as budgeted.
    const has = (ctx.budget?.(category) ?? null) !== null;
    if (!filter.budgets.includes(has ? "budgeted" : "unbudgeted")) return false;
  }
  if (
    constrains(filter.states) &&
    !filter.states.includes(category.is_archived ? "archived" : "active")
  )
    return false;
  return true;
}

export function applyCategoryFilter(
  categories: Category[],
  filter: CategoryFilter,
  ctx: CategoryContext = {},
): Category[] {
  return categories.filter((c) => matchesCategory(c, filter, ctx));
}

export function activeCategoryFilterCount(filter: CategoryFilter): number {
  let n = 0;
  if (terms(filter.text).length > 0) n += 1;
  if (constrains(filter.types)) n += 1;
  if (constrains(filter.budgets)) n += 1;
  if (constrains(filter.states)) n += 1;
  return n;
}

export const CATEGORY_SORTS = ["name", "budget"] as const;
export type CategorySort = (typeof CATEGORY_SORTS)[number];

/** Whether a stored preference is one this build still knows how to render. */
export function isCategorySort(value: string): value is CategorySort {
  return (CATEGORY_SORTS as readonly string[]).includes(value);
}

export interface CategorySortContext {
  budget: (category: Category) => number | null;
}

/**
 * Categories in the order the reader asked for. Returns a new array.
 *
 * By budget, an unbudgeted category ranks below one deliberately set to nothing
 * — no budget is not a budget of zero. Ties fall back to the name and then the
 * id so two devices agree (§8.5).
 */
export function sortCategories(
  categories: Category[],
  order: CategorySort,
  ctx: CategorySortContext,
): Category[] {
  const byName = (a: Category, b: Category) =>
    a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  return [...categories].sort((a, b) => {
    if (order === "budget") {
      const ba = ctx.budget(a);
      const bb = ctx.budget(b);
      if (ba === null || bb === null) {
        if (ba !== bb) return ba === null ? 1 : -1;
      } else if (ba !== bb) return bb - ba;
    }
    return byName(a, b);
  });
}
