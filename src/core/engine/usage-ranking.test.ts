import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  makeCategory,
  makeContainer,
  makeTemplate,
  makeTransaction,
  makeTransfer,
  makeVoidRow,
  type Transaction,
} from "@/core/model";
import {
  rankShortcutsByUsage,
  rankVendorSourcesByUsage,
  sortCategoriesAlphabetically,
  sortContainersAlphabetically,
} from "./usage-ranking";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const entry = (
  id: string,
  category_id: string,
  container_id: string,
  entered_at: string | null,
  inbox_status: "approved" | "pending" = "approved",
) =>
  makeTransaction({
    id,
    date: "2026-07-01",
    amount: -100,
    vendor_source: id,
    category_id,
    container_id,
    entered_at,
    inbox_status,
  });

describe("selector ordering", () => {
  it("sorts categories alphabetically, independent of use", () => {
    const categories = [
      makeCategory({ id: "unused-z", name: "Zulu", type: "expense" }),
      makeCategory({ id: "name-b", name: "Éclair", type: "expense" }),
      makeCategory({ id: "name-a", name: "Éclair", type: "expense" }),
      makeCategory({ id: "recent", name: "Recent", type: "expense" }),
      makeCategory({ id: "frequent", name: "Frequent", type: "expense" }),
      makeCategory({ id: "unused-a", name: "Alpha", type: "expense" }),
    ];
    expect(sortCategoriesAlphabetically(categories).map((c) => c.id)).toEqual([
      "unused-a",
      "name-a",
      "name-b",
      "frequent",
      "recent",
      "unused-z",
    ]);
  });

  it("keeps category type partitions and caller-provided archived inclusion intact", () => {
    const expense = makeCategory({ id: "expense", name: "Expense", type: "expense" });
    const income = makeCategory({ id: "income", name: "Income", type: "income" });
    const archived = {
      ...makeCategory({ id: "archived", name: "Archived", type: "expense" }),
      is_archived: true,
    };
    expect(
      sortCategoriesAlphabetically(
        [expense, income, archived].filter((c) => c.type === "expense" && !c.is_archived),
      ).map((c) => c.id),
    ).toEqual(["expense"]);
    expect(sortCategoriesAlphabetically([expense, archived]).map((c) => c.id)).toEqual([
      "archived",
      "expense",
    ]);
  });

  it("orders container dropdown options alphabetically", () => {
    const containers = [
      makeContainer({ id: "unused", name: "Alpha" }),
      makeContainer({ id: "destination", name: "Destination" }),
      makeContainer({ id: "source", name: "Source" }),
      makeContainer({ id: "entry", name: "Entry" }),
    ];
    expect(sortContainersAlphabetically(containers).map((c) => c.id)).toEqual([
      "unused",
      "destination",
      "entry",
      "source",
    ]);
  });

  it("ranks normalized vendor/source names by frequency, then recency", () => {
    const rows = [
      entry("a1", "cat", "wallet", "2026-07-01T00:00:00.000Z"),
      entry("a2", "cat", "wallet", "2026-07-02T00:00:00.000Z"),
      entry("b1", "cat", "wallet", "2026-07-04T00:00:00.000Z"),
      entry("c1", "cat", "wallet", "2026-07-03T00:00:00.000Z"),
    ];
    rows[0].vendor_source = " Cafe ";
    rows[1].vendor_source = "cafe";
    rows[2].vendor_source = "Employer";
    rows[3].vendor_source = "Market";

    expect(rankVendorSourcesByUsage(rows)).toEqual(["cafe", "Employer", "Market"]);
  });

  it("excludes transfers and inactive rows from vendor/source suggestions", () => {
    const live = entry("live", "cat", "wallet", "2026-07-01T00:00:00.000Z");
    live.vendor_source = "Live";
    const pending = {
      ...entry("pending-vendor", "cat", "wallet", "2026-07-03T00:00:00.000Z"),
      vendor_source: "Pending",
      inbox_status: "pending" as const,
    };
    const transfer = makeTransfer({
      id: "move",
      date: "2026-07-02",
      amount: 100,
      container_id: "source",
      to_container_id: "destination",
      vendor_source: "Source → Destination",
    });

    expect(rankVendorSourcesByUsage([pending, transfer, live])).toEqual(["Live"]);
  });

  it("ranks shortcuts by matching active logged shape", () => {
    const coffee = makeTemplate({
      id: "coffee",
      template_name: "Coffee",
      amount: -500,
      vendor_source: "Cafe",
      container_id: "wallet",
      category_id: "dining",
      notes: "usual",
    });
    const savings = makeTemplate({
      id: "savings",
      template_name: "Savings",
      amount: 10000,
      vendor_source: "Sweep",
      container_id: "wallet",
      to_container_id: "bank",
    });
    const unused = makeTemplate({
      id: "unused",
      template_name: "Alpha",
      amount: -100,
      vendor_source: "Other",
      container_id: "wallet",
      category_id: "misc",
    });
    const rows = [
      makeTransaction({
        id: "coffee-1",
        date: "2026-07-01",
        amount: -500,
        vendor_source: "Cafe",
        category_id: "dining",
        container_id: "wallet",
        notes: "usual",
        entered_at: "2026-07-01T00:00:00.000Z",
      }),
      makeTransaction({
        id: "coffee-2",
        date: "2026-07-02",
        amount: -500,
        vendor_source: "Cafe",
        category_id: "dining",
        container_id: "wallet",
        notes: "usual",
        entered_at: "2026-07-02T00:00:00.000Z",
      }),
      makeTransfer({
        id: "savings-1",
        date: "2026-07-03",
        amount: 10000,
        vendor_source: "Sweep",
        container_id: "wallet",
        to_container_id: "bank",
        entered_at: "2026-07-03T00:00:00.000Z",
      }),
    ];

    expect(
      rankShortcutsByUsage([unused, savings, coffee], rows).map((t) => t.id),
    ).toEqual(["coffee", "savings", "unused"]);
  });

  it("ignores pending, voided, and near-match rows for shortcut usage", () => {
    const exact = makeTemplate({
      id: "exact",
      template_name: "Exact",
      amount: -500,
      vendor_source: "Cafe",
      container_id: "wallet",
      category_id: "dining",
      notes: "usual",
    });
    const other = makeTemplate({
      id: "other",
      template_name: "Other",
      amount: -700,
      vendor_source: "Shop",
      container_id: "wallet",
      category_id: "misc",
    });
    const voided = makeTransaction({
      id: "voided-shortcut",
      date: "2026-07-01",
      amount: -500,
      vendor_source: "Cafe",
      category_id: "dining",
      container_id: "wallet",
      notes: "usual",
    });
    const pending = {
      ...voided,
      id: "pending-shortcut",
      inbox_status: "pending" as const,
    };
    const nearMatch = { ...voided, id: "near-match", notes: "changed" };
    const otherUse = makeTransaction({
      id: "other-use",
      date: "2026-07-02",
      amount: -700,
      vendor_source: "Shop",
      category_id: "misc",
      container_id: "wallet",
    });

    expect(
      rankShortcutsByUsage(
        [exact, other],
        [
          voided,
          makeVoidRow(voided, { id: "void-shortcut" }),
          pending,
          nearMatch,
          otherUse,
        ],
      ).map((t) => t.id),
    ).toEqual(["other", "exact"]);
  });

  it("does not mutate candidates and returns deterministic output", () => {
    const candidates = [
      makeContainer({ id: "b", name: "Same" }),
      makeContainer({ id: "a", name: "Same" }),
    ];
    const original = [...candidates];

    expect(sortContainersAlphabetically(candidates).map((c) => c.id)).toEqual(["a", "b"]);
    expect(candidates).toEqual(original);
    expect(sortContainersAlphabetically(candidates).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it.each([
    ["../../features/ledger/useComposeFields.ts", "sortCategoriesAlphabetically"],
    ["../../features/ledger/useComposeFields.ts", "sortContainersAlphabetically"],
    ["../../features/ledger/EditTransactionSheet.tsx", "sortCategoriesAlphabetically"],
    ["../../features/ledger/EditTransactionSheet.tsx", "sortContainersAlphabetically"],
    ["../../features/recurring/RecurringRuleSheet.tsx", "sortCategoriesAlphabetically"],
    ["../../features/recurring/RecurringRuleSheet.tsx", "sortContainersAlphabetically"],
    ["../../features/ledger/LedgerView.tsx", "sortCategoriesAlphabetically"],
    ["../../features/ledger/LedgerView.tsx", "sortContainersAlphabetically"],
    ["../../features/inbox/InboxView.tsx", "sortCategoriesAlphabetically"],
    ["../../features/inbox/InboxView.tsx", "sortContainersAlphabetically"],
    ["../../features/goals/GoalSheet.tsx", "sortContainersAlphabetically"],
    ["../../features/shell/QuickAddSheet.tsx", "rankShortcutsByUsage"],
  ])("routes selector options in %s through %s", (path, helper) => {
    expect(source(path)).toContain(helper);
  });

  it("does not rank management pages, reports, or filter options from selection", () => {
    for (const path of [
      "../../features/categories/CategoriesView.tsx",
      "../../features/containers/ContainersView.tsx",
      "../../features/reports/widgets.tsx",
    ]) {
      expect(source(path)).not.toContain("ByUsage");
    }
    expect(source("../../features/FilterBar.tsx")).not.toContain(".sort(");
  });
});
