import { describe, it, expect } from "vitest";
import {
  activeCategoryFilterCount,
  applyCategoryFilter,
  isCategorySort,
  matchesCategory,
  sortCategories,
} from "@/features/categories/filter";
import { makeCategory, type Category } from "@/core/model";

const cat = (over: {
  id: string;
  name?: string;
  type?: "expense" | "income";
  archived?: boolean;
}): Category => ({
  ...makeCategory({
    id: over.id,
    name: over.name ?? over.id,
    type: over.type ?? "expense",
  }),
  is_archived: over.archived ?? false,
});

describe("matchesCategory — the categories predicate", () => {
  const food = cat({ id: "food", name: "Groceries" });
  const rent = cat({ id: "rent", name: "Housing" });
  const pay = cat({ id: "pay", name: "Salary", type: "income" });
  const gone = cat({ id: "gone", name: "Old thing", archived: true });
  const all = [food, rent, pay, gone];
  // Only Groceries carries a budget; the view resolves it per category and hands
  // it over, since a budget is time-variant (§5.3) and the predicate is not.
  const budget = (c: Category) => (c.id === "food" ? 60000 : null);

  it("an empty filter matches everything", () => {
    expect(applyCategoryFilter(all, {}, { budget })).toEqual(all);
    for (const c of all) expect(matchesCategory(c, {}, { budget })).toBe(true);
  });

  it("narrows on the name, every word in any order", () => {
    expect(
      applyCategoryFilter(all, { text: "groc" }, { budget }).map((c) => c.id),
    ).toEqual(["food"]);
    expect(
      applyCategoryFilter(all, { text: "GROCERIES" }, { budget }).map((c) => c.id),
    ).toEqual(["food"]);
  });

  it("narrows on type, on whether a budget is set, and on archived", () => {
    expect(
      applyCategoryFilter(all, { types: ["income"] }, { budget }).map((c) => c.id),
    ).toEqual(["pay"]);
    expect(
      applyCategoryFilter(all, { budgets: ["budgeted"] }, { budget }).map((c) => c.id),
    ).toEqual(["food"]);
    expect(
      applyCategoryFilter(all, { budgets: ["unbudgeted"] }, { budget }).map((c) => c.id),
    ).toEqual(["rent", "pay", "gone"]);
    expect(
      applyCategoryFilter(all, { states: ["archived"] }, { budget }).map((c) => c.id),
    ).toEqual(["gone"]);
  });

  it("treats a zero budget as budgeted — nought is a decision, absence is not", () => {
    const zero = (c: Category) => (c.id === "rent" ? 0 : null);
    expect(
      applyCategoryFilter([rent], { budgets: ["budgeted"] }, { budget: zero }),
    ).toEqual([rent]);
  });

  it("combines facets with AND, and an emptied facet constrains nothing", () => {
    expect(
      applyCategoryFilter(
        all,
        { types: ["expense"], states: ["active"] },
        { budget },
      ).map((c) => c.id),
    ).toEqual(["food", "rent"]);
    expect(
      applyCategoryFilter(all, { types: [], budgets: [], states: [] }, { budget }),
    ).toEqual(all);
  });

  it("counts facets, not values", () => {
    expect(activeCategoryFilterCount({})).toBe(0);
    expect(activeCategoryFilterCount({ types: ["expense", "income"] })).toBe(1);
    expect(
      activeCategoryFilterCount({ text: "a", budgets: ["budgeted"], states: ["active"] }),
    ).toBe(3);
  });
});

describe("sortCategories", () => {
  const a = cat({ id: "a", name: "Alpha" });
  const b = cat({ id: "b", name: "Bravo" });
  const c = cat({ id: "c", name: "Charlie" });
  const all = [c, a, b];
  const budget = (x: Category) => ({ a: 20000, b: 90000, c: null })[x.id] ?? null;

  it("only accepts an order this build can render", () => {
    expect(isCategorySort("name")).toBe(true);
    expect(isCategorySort("budget")).toBe(true);
    expect(isCategorySort("spend")).toBe(false);
  });

  it("by name, A–Z", () => {
    expect(sortCategories(all, "name", { budget }).map((x) => x.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("by budget, biggest first, with unbudgeted categories last", () => {
    // No budget is not a budget of zero — an unbudgeted category ranks below
    // one you deliberately set to nothing.
    expect(sortCategories(all, "budget", { budget }).map((x) => x.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("leaves the caller's array alone", () => {
    const input = [...all];
    sortCategories(all, "budget", { budget });
    expect(all).toEqual(input);
  });
});
