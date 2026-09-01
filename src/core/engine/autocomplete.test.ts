import { describe, expect, it } from "vitest";
import {
  makeCategory,
  makeTransaction,
  makeTransfer,
  makeVoidRow,
  type Transaction,
} from "@/core/model";
import {
  rankAutocompleteOptions,
  rankVendorSourcesForKind,
  recallVendorSelection,
} from "./autocomplete";

const categories = [
  makeCategory({ id: "food", name: "Food", type: "expense" }),
  makeCategory({ id: "fun", name: "Fun", type: "expense" }),
  makeCategory({ id: "salary", name: "Salary", type: "income" }),
];

function entry(
  id: string,
  vendor_source: string,
  category_id: string,
  container_id: string,
  entered_at: string,
): Transaction {
  return makeTransaction({
    id,
    date: entered_at.slice(0, 10),
    amount: category_id === "salary" ? 100 : -100,
    vendor_source,
    category_id,
    container_id,
    entered_at,
  });
}

describe("creation autocomplete", () => {
  it("shows common vendors for only the current kind on blank focus", () => {
    const rows = [
      entry("cafe-1", "Café", "food", "cash", "2026-08-01T10:00:00.000Z"),
      entry("cafe-2", " café ", "food", "card", "2026-08-02T10:00:00.000Z"),
      entry("market", "Market", "food", "cash", "2026-08-03T10:00:00.000Z"),
      entry("pay", "Café Payroll", "salary", "bank", "2026-08-04T10:00:00.000Z"),
      makeTransfer({
        id: "sweep-1",
        date: "2026-08-05",
        amount: 100,
        vendor_source: "Savings sweep",
        container_id: "cash",
        to_container_id: "bank",
      }),
      makeTransfer({
        id: "sweep-2",
        date: "2026-08-06",
        amount: 100,
        vendor_source: "Savings sweep",
        container_id: "cash",
        to_container_id: "bank",
      }),
      makeTransfer({
        id: "brokerage",
        date: "2026-08-07",
        amount: 100,
        vendor_source: "Brokerage",
        container_id: "cash",
        to_container_id: "bank",
      }),
    ];

    expect(rankVendorSourcesForKind(rows, categories, "expense", "")).toEqual([
      "café",
      "Market",
    ]);
    expect(rankVendorSourcesForKind(rows, categories, "income", "")).toEqual([
      "Café Payroll",
    ]);
    expect(rankVendorSourcesForKind(rows, categories, "transfer", "")).toEqual([
      "Savings sweep",
      "Brokerage",
    ]);
  });

  it("prioritizes prefix similarity, then frequency, then recency", () => {
    const rows = [
      entry("coffee-1", "Coffee Hut", "food", "cash", "2026-08-01T10:00:00.000Z"),
      entry("coffee-2", "Coffee Hut", "food", "cash", "2026-08-02T10:00:00.000Z"),
      entry("coffee-3", "Coffee Cart", "food", "cash", "2026-08-04T10:00:00.000Z"),
      entry("coffee-4", "Coffee Bean", "food", "cash", "2026-08-03T10:00:00.000Z"),
      entry("other-1", "Best Coffee", "food", "cash", "2026-08-05T10:00:00.000Z"),
      entry("other-2", "Best Coffee", "food", "cash", "2026-08-06T10:00:00.000Z"),
      entry("other-3", "Best Coffee", "food", "cash", "2026-08-07T10:00:00.000Z"),
    ];

    expect(rankVendorSourcesForKind(rows, categories, "expense", "cof")).toEqual([
      "Coffee Hut",
      "Coffee Cart",
      "Coffee Bean",
      "Best Coffee",
    ]);
  });

  it("excludes pending, transfer, template, voided, and incompatible rows", () => {
    const voided = entry("voided", "Voided", "food", "cash", "2026-08-04T10:00:00.000Z");
    const pending = {
      ...entry("pending", "Pending", "food", "cash", "2026-08-05T10:00:00.000Z"),
      inbox_status: "pending" as const,
    };
    const transfer = makeTransfer({
      id: "move",
      date: "2026-08-06",
      amount: 100,
      vendor_source: "Move",
      container_id: "cash",
      to_container_id: "bank",
    });

    expect(
      rankVendorSourcesForKind(
        [
          pending,
          transfer,
          voided,
          makeVoidRow(voided, { id: "void" }),
          entry("income", "Employer", "salary", "bank", "2026-08-07T10:00:00.000Z"),
          entry("live", "Live", "food", "cash", "2026-08-03T10:00:00.000Z"),
        ],
        categories,
        "expense",
        "",
      ),
    ).toEqual(["Live"]);
  });

  it("recalls category/container from latest normalized exact active match", () => {
    const rows = [
      entry("old", " Café ", "food", "cash", "2026-08-01T10:00:00.000Z"),
      entry("new", "café", "fun", "card", "2026-08-03T10:00:00.000Z"),
      entry("income", "CAFÉ", "salary", "bank", "2026-08-04T10:00:00.000Z"),
    ];

    expect(recallVendorSelection(rows, categories, "expense", " CAFÉ ")).toEqual({
      categoryId: "fun",
      containerId: "card",
    });
    expect(recallVendorSelection(rows, categories, "income", "café")).toEqual({
      categoryId: "salary",
      containerId: "bank",
    });
    expect(recallVendorSelection(rows, categories, "transfer", "café")).toBeNull();
    expect(recallVendorSelection(rows, categories, "expense", "café unknown")).toBeNull();
  });

  it("ranks existing entity options by prefix then supplied usage order", () => {
    const options = [
      { id: "common", label: "Main Coffee Card" },
      { id: "prefix-common", label: "Cash" },
      { id: "prefix-other", label: "Card" },
      { id: "miss", label: "Savings" },
    ];

    expect(rankAutocompleteOptions(options, "ca").map((option) => option.id)).toEqual([
      "prefix-common",
      "prefix-other",
      "common",
    ]);
    expect(rankAutocompleteOptions(options, "")).toEqual(options);
  });
});
