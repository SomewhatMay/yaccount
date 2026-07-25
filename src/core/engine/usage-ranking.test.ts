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
  rankCategoriesByUsage,
  rankContainersByUsage,
  rankShortcutsByUsage,
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

describe("usage-ranked selectors", () => {
  it("ranks categories by active count, recency, locale-aware name, then id", () => {
    const categories = [
      makeCategory({ id: "unused-z", name: "Zulu", type: "expense" }),
      makeCategory({ id: "name-b", name: "Éclair", type: "expense" }),
      makeCategory({ id: "name-a", name: "Éclair", type: "expense" }),
      makeCategory({ id: "recent", name: "Recent", type: "expense" }),
      makeCategory({ id: "frequent", name: "Frequent", type: "expense" }),
      makeCategory({ id: "unused-a", name: "Alpha", type: "expense" }),
    ];
    const rows = [
      entry("f1", "frequent", "wallet", "2026-07-01T09:00:00.000Z"),
      entry("f2", "frequent", "wallet", "2026-07-01T10:00:00.000Z"),
      entry("r1", "recent", "wallet", "2026-07-02T10:00:00.000Z"),
      entry("n1", "name-a", "wallet", "2026-07-01T08:00:00.000Z"),
      entry("n2", "name-b", "wallet", "2026-07-01T08:00:00.000Z"),
    ];

    expect(rankCategoriesByUsage(categories, rows).map((c) => c.id)).toEqual([
      "frequent",
      "recent",
      "name-a",
      "name-b",
      "unused-a",
      "unused-z",
    ]);
  });

  it("ignores voided, template, and pending category rows and uses date fallback", () => {
    const categories = [
      makeCategory({ id: "kept", name: "Kept", type: "expense" }),
      makeCategory({ id: "ignored", name: "Ignored", type: "expense" }),
      makeCategory({ id: "older", name: "Older", type: "expense" }),
    ];
    const voided = entry("voided", "ignored", "wallet", "2026-07-04T00:00:00.000Z");
    const template = makeTemplate({
      id: "template",
      template_name: "Template",
      amount: -100,
      vendor_source: "Template",
      container_id: "wallet",
      category_id: "ignored",
    });
    const pending = entry(
      "pending",
      "ignored",
      "wallet",
      "2026-07-05T00:00:00.000Z",
      "pending",
    );
    const fallback: Transaction = {
      ...entry("fallback", "kept", "wallet", null),
      date: "2026-07-03",
      yearMonth: "2026-07",
    };
    const older: Transaction = {
      ...entry("older-row", "older", "wallet", null),
      date: "2026-07-02",
      yearMonth: "2026-07",
    };

    expect(
      rankCategoriesByUsage(categories, [
        voided,
        makeVoidRow(voided, { id: "void" }),
        template,
        pending,
        fallback,
        older,
      ]).map((c) => c.id),
    ).toEqual(["kept", "older", "ignored"]);
  });

  it("keeps category type partitions and caller-provided archived inclusion intact", () => {
    const expense = makeCategory({ id: "expense", name: "Expense", type: "expense" });
    const income = makeCategory({ id: "income", name: "Income", type: "income" });
    const archived = {
      ...makeCategory({ id: "archived", name: "Archived", type: "expense" }),
      is_archived: true,
    };
    const rows = [
      entry("i1", "income", "wallet", "2026-07-03T00:00:00.000Z"),
      entry("a1", "archived", "wallet", "2026-07-02T00:00:00.000Z"),
      entry("e1", "expense", "wallet", "2026-07-01T00:00:00.000Z"),
    ];

    expect(
      rankCategoriesByUsage(
        [expense, income, archived].filter((c) => c.type === "expense" && !c.is_archived),
        rows,
      ).map((c) => c.id),
    ).toEqual(["expense"]);
    expect(rankCategoriesByUsage([expense, archived], rows).map((c) => c.id)).toEqual([
      "archived",
      "expense",
    ]);
  });

  it("counts both transfer endpoints once for container participation", () => {
    const containers = [
      makeContainer({ id: "unused", name: "Alpha" }),
      makeContainer({ id: "destination", name: "Destination" }),
      makeContainer({ id: "source", name: "Source" }),
      makeContainer({ id: "entry", name: "Entry" }),
    ];
    const transfer = makeTransfer({
      id: "transfer",
      date: "2026-07-01",
      amount: 100,
      container_id: "source",
      to_container_id: "destination",
      vendor_source: "Move",
      entered_at: "2026-07-02T00:00:00.000Z",
    });
    const rows = [
      transfer,
      entry("entry-1", "cat", "entry", "2026-07-03T00:00:00.000Z"),
      entry("source-2", "cat", "source", "2026-07-01T00:00:00.000Z"),
    ];

    expect(rankContainersByUsage(containers, rows).map((c) => c.id)).toEqual([
      "source",
      "entry",
      "destination",
      "unused",
    ]);
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

    expect(rankContainersByUsage(candidates, []).map((c) => c.id)).toEqual(["a", "b"]);
    expect(candidates).toEqual(original);
    expect(rankContainersByUsage(candidates, []).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it.each([
    ["../../features/ledger/useComposeFields.ts", "rankCategoriesByUsage"],
    ["../../features/ledger/useComposeFields.ts", "rankContainersByUsage"],
    ["../../features/ledger/EditTransactionSheet.tsx", "rankCategoriesByUsage"],
    ["../../features/ledger/EditTransactionSheet.tsx", "rankContainersByUsage"],
    ["../../features/recurring/RecurringRuleSheet.tsx", "rankCategoriesByUsage"],
    ["../../features/recurring/RecurringRuleSheet.tsx", "rankContainersByUsage"],
    ["../../features/ledger/LedgerView.tsx", "rankCategoriesByUsage"],
    ["../../features/ledger/LedgerView.tsx", "rankContainersByUsage"],
    ["../../features/inbox/InboxView.tsx", "rankCategoriesByUsage"],
    ["../../features/inbox/InboxView.tsx", "rankContainersByUsage"],
    ["../../features/goals/GoalSheet.tsx", "rankContainersByUsage"],
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
