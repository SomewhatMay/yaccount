import { describe, it, expect } from "vitest";
import {
  activeGoalFilterCount,
  applyGoalFilter,
  goalState,
  isGoalSort,
  matchesGoal,
  sortGoals,
} from "@/features/goals/filter";
import { makeGoal, type Goal } from "@/core/model";

const goal = (over: {
  id: string;
  name?: string | null;
  kind?: "spend_down" | "reserve";
  target?: number | null;
  deadline?: string | null;
  status?: "active" | "completed" | "cancelled";
  archived?: boolean;
}): Goal =>
  makeGoal({
    id: over.id,
    container_id: `c-${over.id}`,
    name: over.name === undefined ? over.id : over.name,
    kind: over.kind ?? "spend_down",
    mode: over.deadline ? "deadline" : "passive",
    target_amount: over.target === undefined ? 100000 : over.target,
    deadline: over.deadline ?? null,
    status: over.status ?? "active",
    is_archived: over.archived ?? false,
    created_date: "2026-01-01",
  });

describe("goalState — one state per goal, so a facet can name it", () => {
  it("reads status, with archived winning over it", () => {
    expect(goalState(goal({ id: "a" }))).toBe("active");
    expect(goalState(goal({ id: "b", status: "completed" }))).toBe("completed");
    expect(goalState(goal({ id: "c", status: "cancelled" }))).toBe("cancelled");
    // Archived is where the goal actually IS on the screen — a cancelled goal
    // that was then archived lives in the Archived section, not the closed one,
    // so the facet has to agree with where the row is.
    expect(goalState(goal({ id: "d", status: "cancelled", archived: true }))).toBe(
      "archived",
    );
  });
});

describe("matchesGoal — the goals predicate", () => {
  const trip = goal({ id: "trip", name: "Japan trip" });
  const buffer = goal({ id: "buffer", name: "Emergency fund", kind: "reserve" });
  const old = goal({ id: "old", name: "Old laptop", status: "completed" });
  const gone = goal({ id: "gone", name: "Cancelled thing", archived: true });
  const all = [trip, buffer, old, gone];

  it("an empty filter matches everything", () => {
    expect(applyGoalFilter(all, {})).toEqual(all);
    for (const g of all) expect(matchesGoal(g, {})).toBe(true);
  });

  it("narrows on text, every word in any order, ignoring case", () => {
    expect(applyGoalFilter(all, { text: "japan" }).map((g) => g.id)).toEqual(["trip"]);
    expect(applyGoalFilter(all, { text: "TRIP japan" }).map((g) => g.id)).toEqual([
      "trip",
    ]);
    expect(applyGoalFilter(all, { text: "japan fund" })).toEqual([]);
  });

  it("searches the container name a nameless goal shows instead", () => {
    // A goal's `name` may be null — the row falls back to its container's name,
    // so the search box has to look at what is actually on the screen.
    const nameless = goal({ id: "n", name: null });
    const label = (g: Goal) => (g.id === "n" ? "Vacation" : "");
    expect(applyGoalFilter([nameless], { text: "vacation" }, { label })).toEqual([
      nameless,
    ]);
  });

  it("narrows on state and on kind", () => {
    expect(applyGoalFilter(all, { states: ["active"] }).map((g) => g.id)).toEqual([
      "trip",
      "buffer",
    ]);
    expect(
      applyGoalFilter(all, { states: ["completed", "archived"] }).map((g) => g.id),
    ).toEqual(["old", "gone"]);
    expect(applyGoalFilter(all, { kinds: ["reserve"] }).map((g) => g.id)).toEqual([
      "buffer",
    ]);
  });

  it("combines facets with AND", () => {
    expect(
      applyGoalFilter(all, { states: ["active"], kinds: ["spend_down"] }).map(
        (g) => g.id,
      ),
    ).toEqual(["trip"]);
  });

  it("treats an emptied facet as no constraint", () => {
    expect(applyGoalFilter(all, { states: [], kinds: [], text: "  " })).toEqual(all);
  });

  it("counts the facets narrowing the list, not the values picked", () => {
    expect(activeGoalFilterCount({})).toBe(0);
    expect(activeGoalFilterCount({ states: ["active", "completed"] })).toBe(1);
    expect(
      activeGoalFilterCount({ text: "x", states: ["active"], kinds: ["reserve"] }),
    ).toBe(3);
    expect(activeGoalFilterCount({ text: "   ", states: [] })).toBe(0);
  });
});

describe("sortGoals", () => {
  const a = goal({ id: "a", name: "Alpha", deadline: "2026-12-01" });
  const b = goal({ id: "b", name: "Bravo", deadline: "2026-03-01" });
  const c = goal({ id: "c", name: "Charlie" });
  const all = [c, a, b];
  const label = (g: Goal) => g.name ?? "";
  const progress = (g: Goal) => ({ a: 0.25, b: 0.9, c: null })[g.id] ?? null;

  it("only accepts an order this build can render", () => {
    expect(isGoalSort("name")).toBe(true);
    expect(isGoalSort("progress")).toBe(true);
    expect(isGoalSort("deadline")).toBe(true);
    expect(isGoalSort("whatever")).toBe(false);
  });

  it("by name, A–Z", () => {
    expect(sortGoals(all, "name", { label, progress }).map((g) => g.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("by progress, most complete first, with no-progress goals last", () => {
    expect(sortGoals(all, "progress", { label, progress }).map((g) => g.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("by deadline, soonest first, with open-ended goals last", () => {
    // A goal with no date isn't "due first" — it isn't due at all.
    expect(sortGoals(all, "deadline", { label, progress }).map((g) => g.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("leaves the caller's array alone and breaks ties the same way everywhere", () => {
    const tied = [goal({ id: "z", name: "Same" }), goal({ id: "y", name: "Same" })];
    const input = [...tied];
    // Ties fall back to the id so two devices agree on one order (§8.5).
    expect(sortGoals(tied, "name", { label, progress }).map((g) => g.id)).toEqual([
      "y",
      "z",
    ]);
    expect(tied).toEqual(input);
  });
});
