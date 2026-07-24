import { describe, it, expect } from "vitest";
import {
  activeFilterCount,
  applyFilter,
  constrains,
  isFilterActive,
  matchesFilter,
  matchesWords,
  terms,
  transactionKind,
  type TransactionFilter,
} from "@/core/engine/filter";
import { makeTransaction, makeTransfer, type Transaction } from "@/core/model";

const row = (over: {
  id: string;
  amount: number;
  vendor?: string;
  category_id?: string;
  container_id?: string;
  date?: string;
}): Transaction =>
  makeTransaction({
    id: over.id,
    date: over.date ?? "2026-07-20",
    amount: over.amount,
    vendor_source: over.vendor ?? "Blue Bottle",
    category_id: over.category_id ?? "coffee",
    container_id: over.container_id ?? "wallet",
  });

const move = (over: {
  id: string;
  amount?: number;
  from?: string;
  to?: string;
  date?: string;
}): Transaction =>
  makeTransfer({
    id: over.id,
    date: over.date ?? "2026-07-20",
    amount: over.amount ?? 30000,
    container_id: over.from ?? "wallet",
    to_container_id: over.to ?? "savings",
    fromName: "Wallet",
    toName: "Savings",
  });

describe("transactionKind — the three things a row can be (§5.4)", () => {
  it("reads the shape, not the label", () => {
    expect(transactionKind(row({ id: "a", amount: -450 }))).toBe("expense");
    expect(transactionKind(row({ id: "b", amount: 214000 }))).toBe("income");
    expect(transactionKind(move({ id: "c" }))).toBe("transfer");
  });

  it("treats a zero row as income, matching how the register colours it", () => {
    // The register's rule is `amount >= 0` — one rule, stated once, so a filter
    // can never disagree with what is on screen.
    expect(transactionKind(row({ id: "z", amount: 0 }))).toBe("income");
  });
});

describe("matchesFilter — the one predicate every list view shares", () => {
  const coffee = row({ id: "a", amount: -450, vendor: "Blue Bottle" });
  const rent = row({
    id: "b",
    amount: -185000,
    vendor: "Landlord",
    category_id: "housing",
  });
  const pay = row({
    id: "c",
    amount: 214000,
    vendor: "Paycheck",
    category_id: "salary",
    container_id: "checking",
  });
  const transfer = move({ id: "d" });
  const all = [coffee, rent, pay, transfer];

  it("an empty filter matches everything — nothing asked is not nothing shown", () => {
    expect(applyFilter(all, {})).toEqual(all);
    for (const t of all) expect(matchesFilter(t, {})).toBe(true);
  });

  it("narrows on text, ignoring case, every word in any order", () => {
    expect(applyFilter(all, { text: "blue" }).map((t) => t.id)).toEqual(["a"]);
    expect(applyFilter(all, { text: "BOTTLE blue" }).map((t) => t.id)).toEqual(["a"]);
    expect(applyFilter(all, { text: "blue rent" })).toEqual([]);
  });

  it("also searches whatever else the caller can name a row by", () => {
    // The engine has no category table; the view does, so it passes the label in.
    const label = (t: Transaction) => (t.category_id === "housing" ? "Housing" : "");
    expect(applyFilter(all, { text: "housing" }, { label }).map((t) => t.id)).toEqual([
      "b",
    ]);
  });

  it("narrows on category, and never matches a transfer (it has none)", () => {
    expect(
      applyFilter(all, { categoryIds: ["coffee", "salary"] }).map((t) => t.id),
    ).toEqual(["a", "c"]);
    expect(applyFilter(all, { categoryIds: ["coffee"] }).map((t) => t.id)).toEqual(["a"]);
  });

  it("matches a wallet on EITHER leg of a transfer", () => {
    // A transfer touches two containers; filtering by the destination has to find
    // it, or money you moved into savings would be invisible under "Savings".
    expect(applyFilter(all, { containerIds: ["savings"] }).map((t) => t.id)).toEqual([
      "d",
    ]);
    expect(applyFilter(all, { containerIds: ["wallet"] }).map((t) => t.id)).toEqual([
      "a",
      "b",
      "d",
    ]);
    expect(applyFilter(all, { containerIds: ["checking"] }).map((t) => t.id)).toEqual([
      "c",
    ]);
  });

  it("narrows on kind", () => {
    expect(applyFilter(all, { kinds: ["expense"] }).map((t) => t.id)).toEqual(["a", "b"]);
    expect(applyFilter(all, { kinds: ["income", "transfer"] }).map((t) => t.id)).toEqual([
      "c",
      "d",
    ]);
  });

  it("narrows on a date range, inclusive, open on a null side", () => {
    const dated = [
      row({ id: "jan", amount: -100, date: "2026-01-15" }),
      row({ id: "jun", amount: -100, date: "2026-06-15" }),
      row({ id: "jul", amount: -100, date: "2026-07-15" }),
    ];
    expect(
      applyFilter(dated, { range: { start: "2026-06-15", end: "2026-07-15" } }).map(
        (t) => t.id,
      ),
    ).toEqual(["jun", "jul"]);
    expect(
      applyFilter(dated, { range: { start: null, end: "2026-06-15" } }).map((t) => t.id),
    ).toEqual(["jan", "jun"]);
    expect(
      applyFilter(dated, { range: { start: "2026-07-01", end: null } }).map((t) => t.id),
    ).toEqual(["jul"]);
  });

  it("narrows on amount by SIZE, not direction", () => {
    // "anything over $100" is a question about how big the entry is; a $2,140
    // paycheck and a $1,850 rent are both big.
    expect(applyFilter(all, { minAmount: 100000 }).map((t) => t.id)).toEqual(["b", "c"]);
    expect(applyFilter(all, { maxAmount: 1000 }).map((t) => t.id)).toEqual(["a"]);
    expect(
      applyFilter(all, { minAmount: 30000, maxAmount: 200000 }).map((t) => t.id),
    ).toEqual(["b", "d"]);
  });

  it("bounds are inclusive on both ends", () => {
    expect(applyFilter([coffee], { minAmount: 450, maxAmount: 450 })).toEqual([coffee]);
  });

  it("combines facets with AND", () => {
    const f: TransactionFilter = {
      kinds: ["expense"],
      containerIds: ["wallet"],
      minAmount: 100000,
    };
    expect(applyFilter(all, f).map((t) => t.id)).toEqual(["b"]);
  });

  it("treats an empty list for a facet as no constraint", () => {
    // The UI clears a facet by emptying it; that must mean "all", not "none".
    expect(applyFilter(all, { categoryIds: [], kinds: [], containerIds: [] })).toEqual(
      all,
    );
    expect(applyFilter(all, { text: "   " })).toEqual(all);
  });

  it("preserves the caller's order — sorting is not the filter's business", () => {
    const reversed = [...all].reverse();
    expect(applyFilter(reversed, { kinds: ["expense"] }).map((t) => t.id)).toEqual([
      "b",
      "a",
    ]);
  });
});

describe("activeFilterCount / isFilterActive — what the rail reports", () => {
  it("counts the facets constraining the list, not the values picked", () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ text: "blue" })).toBe(1);
    expect(activeFilterCount({ categoryIds: ["a", "b", "c"] })).toBe(1);
    expect(activeFilterCount({ text: "blue", kinds: ["expense"], minAmount: 500 })).toBe(
      3,
    );
  });

  it("does not count an emptied facet", () => {
    expect(
      activeFilterCount({
        text: "  ",
        categoryIds: [],
        containerIds: [],
        kinds: [],
        range: { start: null, end: null },
        minAmount: null,
        maxAmount: null,
      }),
    ).toBe(0);
  });

  it("counts a date range once however many sides are set", () => {
    expect(activeFilterCount({ range: { start: "2026-07-01", end: null } })).toBe(1);
    expect(activeFilterCount({ range: { start: "2026-07-01", end: "2026-07-31" } })).toBe(
      1,
    );
  });

  it("counts an amount range once however many sides are set", () => {
    expect(activeFilterCount({ minAmount: 500 })).toBe(1);
    expect(activeFilterCount({ minAmount: 500, maxAmount: 900 })).toBe(1);
  });

  it("isFilterActive is the yes/no the carried balance hides on (§12.4)", () => {
    expect(isFilterActive({})).toBe(false);
    expect(isFilterActive({ categoryIds: [] })).toBe(false);
    expect(isFilterActive({ text: "blue" })).toBe(true);
  });
});

describe("ruleIds — which recurring rule proposed a row (the Inbox's facet)", () => {
  const fromRent = makeTransaction({
    id: "r1",
    date: "2026-07-20",
    amount: -185000,
    vendor_source: "Rent",
    category_id: "housing",
    recurring_rule_id: "rule-rent",
    inbox_status: "pending",
  });
  const fromGym = makeTransaction({
    id: "g1",
    date: "2026-07-20",
    amount: -4500,
    vendor_source: "Gym",
    category_id: "health",
    recurring_rule_id: "rule-gym",
    inbox_status: "pending",
  });
  const byHand = row({ id: "h1", amount: -450 });
  const all = [fromRent, fromGym, byHand];

  it("narrows to the rows a chosen rule proposed", () => {
    expect(applyFilter(all, { ruleIds: ["rule-rent"] }).map((t) => t.id)).toEqual(["r1"]);
    expect(
      applyFilter(all, { ruleIds: ["rule-rent", "rule-gym"] }).map((t) => t.id),
    ).toEqual(["r1", "g1"]);
  });

  it("never matches a row nothing proposed", () => {
    // A hand-written row came from no rule, so no rule can claim it.
    expect(applyFilter(all, { ruleIds: ["rule-rent"] }).map((t) => t.id)).not.toContain(
      "h1",
    );
  });

  it("empty means all, and it counts as one facet", () => {
    expect(applyFilter(all, { ruleIds: [] })).toEqual(all);
    expect(activeFilterCount({ ruleIds: [] })).toBe(0);
    expect(activeFilterCount({ ruleIds: ["rule-rent", "rule-gym"] })).toBe(1);
  });
});

describe("the shared text primitives", () => {
  it("terms drops the whitespace an empty box is made of", () => {
    expect(terms(undefined)).toEqual([]);
    expect(terms("   ")).toEqual([]);
    expect(terms(" Blue  BOTTLE ")).toEqual(["blue", "bottle"]);
  });

  it("matchesWords needs every word, in any order, ignoring case", () => {
    expect(matchesWords("Blue Bottle Coffee", [])).toBe(true);
    expect(matchesWords("Blue Bottle Coffee", ["bottle", "blue"])).toBe(true);
    expect(matchesWords("Blue Bottle Coffee", ["blue", "rent"])).toBe(false);
  });

  it("constrains reads an emptied facet as no constraint", () => {
    expect(constrains(undefined)).toBe(false);
    expect(constrains([])).toBe(false);
    expect(constrains(["a"])).toBe(true);
  });
});
