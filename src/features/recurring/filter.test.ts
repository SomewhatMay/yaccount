import { describe, it, expect } from "vitest";
import {
  activeRuleFilterCount,
  applyRuleFilter,
  isRuleSort,
  matchesRule,
  ruleKind,
  sortRules,
} from "@/features/recurring/filter";
import { makeRecurringRule, type RecurringRule } from "@/core/model";

const rule = (over: {
  id: string;
  name?: string;
  amount?: number | null;
  category?: string | null;
  to?: string | null;
  frequency?: "daily" | "weekly" | "monthly";
  next?: string;
  status?: "active" | "cancelled";
}): RecurringRule =>
  makeRecurringRule({
    id: over.id,
    frequency: over.frequency ?? "monthly",
    interval_config:
      over.frequency === "daily"
        ? {}
        : over.frequency === "weekly"
          ? { day_of_week: 1 }
          : { day_of_month: 1 },
    template_vendor_source: over.name ?? over.id,
    template_container_id: "wallet",
    template_category_id: over.to ? null : (over.category ?? "housing"),
    template_to_container_id: over.to ?? null,
    template_amount: over.amount === undefined ? -185000 : over.amount,
    start_date: "2026-01-01",
    next_generation_date: over.next ?? "2026-08-01",
    status: over.status ?? "active",
  });

describe("ruleKind — what a rule will generate", () => {
  it("reads the shape, by the same rule the row colours by", () => {
    // The row calls a rule income when `template_amount ?? 0 >= 0`; if the
    // filter used a different test, the chip would hide a row that is on screen
    // in emerald.
    expect(ruleKind(rule({ id: "rent" }))).toBe("expense");
    expect(ruleKind(rule({ id: "pay", amount: 214000, category: "salary" }))).toBe(
      "income",
    );
    expect(ruleKind(rule({ id: "save", to: "savings", amount: 30000 }))).toBe("transfer");
  });
});

describe("matchesRule — the recurring predicate", () => {
  const rent = rule({ id: "rent", name: "Rent" });
  const pay = rule({
    id: "pay",
    name: "Paycheck",
    amount: 214000,
    category: "salary",
    frequency: "weekly",
  });
  const save = rule({ id: "save", name: "To savings", to: "savings", amount: 30000 });
  const gym = rule({ id: "gym", name: "Gym", status: "cancelled" });
  const all = [rent, pay, save, gym];

  it("an empty filter matches everything", () => {
    expect(applyRuleFilter(all, {})).toEqual(all);
    for (const r of all) expect(matchesRule(r, {})).toBe(true);
  });

  it("narrows on text over the payee and whatever else names it", () => {
    expect(applyRuleFilter(all, { text: "rent" }).map((r) => r.id)).toEqual(["rent"]);
    const label = (r: RecurringRule) => (r.id === "rent" ? "Housing Wallet" : "");
    expect(applyRuleFilter(all, { text: "housing" }, { label }).map((r) => r.id)).toEqual(
      ["rent"],
    );
  });

  it("narrows on status, frequency and kind", () => {
    expect(applyRuleFilter(all, { statuses: ["cancelled"] }).map((r) => r.id)).toEqual([
      "gym",
    ]);
    expect(applyRuleFilter(all, { frequencies: ["weekly"] }).map((r) => r.id)).toEqual([
      "pay",
    ]);
    expect(applyRuleFilter(all, { kinds: ["transfer"] }).map((r) => r.id)).toEqual([
      "save",
    ]);
    expect(
      applyRuleFilter(all, { kinds: ["expense", "income"] }).map((r) => r.id),
    ).toEqual(["rent", "pay", "gym"]);
  });

  it("combines facets with AND, and an emptied facet constrains nothing", () => {
    expect(
      applyRuleFilter(all, { statuses: ["active"], kinds: ["expense"] }).map((r) => r.id),
    ).toEqual(["rent"]);
    expect(applyRuleFilter(all, { statuses: [], frequencies: [], kinds: [] })).toEqual(
      all,
    );
  });

  it("counts facets, not values", () => {
    expect(activeRuleFilterCount({})).toBe(0);
    expect(activeRuleFilterCount({ frequencies: ["daily", "weekly"] })).toBe(1);
    expect(
      activeRuleFilterCount({ text: "a", statuses: ["active"], kinds: ["expense"] }),
    ).toBe(3);
  });
});

describe("sortRules", () => {
  const soon = rule({ id: "soon", name: "Bravo", next: "2026-08-02", amount: -1000 });
  const later = rule({ id: "later", name: "Alpha", next: "2026-09-01", amount: -900000 });
  const mid = rule({ id: "mid", name: "Charlie", next: "2026-08-15", amount: 5000 });
  const all = [mid, later, soon];
  const label = (r: RecurringRule) => r.template_vendor_source;

  it("only accepts an order this build can render", () => {
    expect(isRuleSort("next")).toBe(true);
    expect(isRuleSort("name")).toBe(true);
    expect(isRuleSort("amount")).toBe(true);
    expect(isRuleSort("soonest")).toBe(false);
  });

  it("by next due date, soonest first", () => {
    expect(sortRules(all, "next", { label }).map((r) => r.id)).toEqual([
      "soon",
      "mid",
      "later",
    ]);
  });

  it("by name, A–Z", () => {
    expect(sortRules(all, "name", { label }).map((r) => r.id)).toEqual([
      "later",
      "soon",
      "mid",
    ]);
  });

  it("by amount, biggest first, by SIZE not direction", () => {
    // A paycheck is as big an entry as the rent it pays.
    expect(sortRules(all, "amount", { label }).map((r) => r.id)).toEqual([
      "later",
      "mid",
      "soon",
    ]);
  });

  it("leaves the caller's array alone", () => {
    const input = [...all];
    sortRules(all, "name", { label });
    expect(all).toEqual(input);
  });
});
