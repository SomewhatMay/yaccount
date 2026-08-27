import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import {
  makeContainer,
  makeTransaction,
  makeTransfer,
  makeVoidRow,
  type Transaction,
} from "@/core/model";
import { containerBalance, netContributions } from "@/core/engine/balances";
import { sortRegister } from "@/core/engine/ledger";
import {
  deriveLedgerReadModel,
  entryIndexKey,
  reverseStringKey,
  type LedgerReadSort,
} from "./ledger-read";

const row = (
  id: string,
  date: string,
  amount: number,
  enteredAt: string | null,
): Transaction =>
  makeTransaction({
    id,
    date,
    amount,
    entered_at: enteredAt,
    vendor_source: id,
    category_id: "food",
  });

function compareIdbKeys(a: IDBValidKey, b: IDBValidKey): number {
  return indexedDB.cmp(a, b);
}

describe("ledger read-model pure contracts", () => {
  it("reverses strings including prefixes and Unicode without collisions", () => {
    const values = ["a", "aa", "b", "é", "😀", "😀a"];
    const reversed = [...values]
      .sort((a, b) => compareIdbKeys(reverseStringKey(a), reverseStringKey(b)))
      .map(String);

    expect(reversed).toEqual([...values].sort().reverse());
    expect(
      new Set(values.map((value) => JSON.stringify(reverseStringKey(value)))).size,
    ).toBe(values.length);
  });

  it("projects exactly live Ledger, pending, and template rows", () => {
    const original = row("original", "2026-08-20", -1_000, null);
    const reversal = makeVoidRow(original, { id: "void" });
    const live = row("live", "2026-08-21", -2_000, null);
    const pending = {
      ...row("pending", "2026-08-22", -3_000, null),
      inbox_status: "pending" as const,
    };
    const template = {
      ...row("template", "2000-01-01", -4_000, null),
      is_template: true,
      template_name: "Template",
    };

    const model = deriveLedgerReadModel([
      original,
      reversal,
      live,
      pending,
      template,
    ]);

    expect(model.entries.map(({ id, state }) => [id, state]).sort()).toEqual([
      ["live", "ledger"],
      ["pending", "pending"],
      ["template", "template"],
    ]);
    expect(model.counts).toEqual({ ledger: 1, pending: 1, template: 1 });
  });

  it("matches every existing register sort with deterministic ties", () => {
    const rows = [
      row("a", "2026-08-20", -500, null),
      row("aa", "2026-08-20", 500, "2026-08-20T10:00:00.000Z"),
      row("😀", "2026-08-21", -500, "2026-08-21T10:00:00.000Z"),
      row("é", "2026-08-19", -100, "2026-08-19T10:00:00.000Z"),
    ];
    const entries = deriveLedgerReadModel(rows).entries.filter(
      (entry) => entry.state === "ledger",
    );

    for (const sort of ["newest", "oldest", "largest", "smallest"] as const) {
      const direction = sort === "newest" || sort === "largest" ? -1 : 1;
      const actual = [...entries]
        .sort(
          (a, b) =>
            direction * compareIdbKeys(entryIndexKey(a, sort), entryIndexKey(b, sort)),
        )
        .map((entry) => entry.id);
      expect(actual, sort).toEqual(sortRegister(rows, sort).map((entry) => entry.id));
    }
  });

  it("derives reversal-inclusive balances and transfer contributions", () => {
    const general = makeContainer({ id: "general", name: "General" });
    const savings = makeContainer({ id: "savings", name: "Savings" });
    const expense = row("expense", "2026-08-20", -2_500, null);
    const transfer = makeTransfer({
      id: "transfer",
      date: "2026-08-21",
      amount: 10_000,
      container_id: general.id,
      to_container_id: savings.id,
      vendor_source: "General to Savings",
    });
    const reversal = makeVoidRow(expense, { id: "void-expense", on: "2026-08-22" });
    const transactions = [expense, transfer, reversal];

    const model = deriveLedgerReadModel(transactions);
    for (const container of [general, savings]) {
      expect(model.facts.get(container.id)?.balance).toBe(
        containerBalance(transactions, container.id),
      );
      expect(model.facts.get(container.id)?.netContribution).toBe(
        netContributions(transactions, container.id),
      );
    }
    expect(
      model.buckets
        .filter((bucket) => bucket.period === "day" && bucket.containerId === general.id)
        .map((bucket) => [bucket.key, bucket.balanceDelta]),
    ).toEqual([
      ["2026-08-20", -2_500],
      ["2026-08-21", -10_000],
      ["2026-08-22", 2_500],
    ]);
    expect(
      model.buckets.find(
        (bucket) =>
          bucket.period === "month" &&
          bucket.containerId === general.id &&
          bucket.key === "2026-08",
      ),
    ).toMatchObject({ ordinaryIn: 2_500, ordinaryOut: 2_500, ordinaryCount: 2 });
  });

  it("derives compact active-entry usage, recall, and shortcut-shape facts", () => {
    const older = makeTransaction({
      id: "older",
      date: "2026-08-20",
      amount: -500,
      entered_at: "2026-08-20T10:00:00.000Z",
      vendor_source: " Corner Cafe ",
      category_id: "food",
      container_id: "general",
      notes: "usual",
    });
    const newer = makeTransaction({
      id: "newer",
      date: "2026-08-21",
      amount: -500,
      entered_at: "2026-08-21T10:00:00.000Z",
      vendor_source: "Corner Café",
      category_id: "food",
      container_id: "general",
      notes: "usual",
    });
    const model = deriveLedgerReadModel([older, newer]);

    expect(model.usage.find((fact) => fact.id === "usage:category:food")).toMatchObject({
      count: 2,
      recent: newer.entered_at,
    });
    expect(
      model.usage.find((fact) => fact.id === "usage:container:general"),
    ).toMatchObject({ count: 2, recent: newer.entered_at });
    expect(
      model.usage.filter((fact) => fact.kind === "vendor").map((fact) => ({
        value: fact.value,
        categoryId: fact.categoryId,
        containerId: fact.containerId,
      })),
    ).toEqual([
      {
        value: "Corner Cafe",
        categoryId: "food",
        containerId: "general",
      },
      {
        value: "Corner Café",
        categoryId: "food",
        containerId: "general",
      },
    ]);
    expect(model.usage.filter((fact) => fact.kind === "shortcut")).toHaveLength(2);
  });
});

void (null as LedgerReadSort | null);
