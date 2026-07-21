import { describe, it, expect } from "vitest";
import { containerBalance } from "@/core/engine/balances";
import { makeTransaction, makeVoidRow, type Transaction } from "@/core/model";

const tx = (over: Partial<Transaction> & { amount: number }): Transaction => ({
  ...makeTransaction({
    date: "2026-07-20",
    amount: over.amount,
    vendor_source: "x",
    category_id: "c1",
  }),
  ...over,
});

describe("containerBalance — §0.4 balance identity", () => {
  it("sums signed expense/income rows for the container", () => {
    const txns = [
      tx({ amount: 500000 }), // +$5000 income
      tx({ amount: -1000 }), // -$10 expense
      tx({ amount: -2500 }), // -$25 expense
    ];
    expect(containerBalance(txns, "general")).toBe(496500);
  });

  it("excludes pending and template rows (not live ledger, §5.4)", () => {
    const txns = [
      tx({ amount: -1000 }),
      tx({ amount: -9999, inbox_status: "pending" }),
      tx({ amount: -8888, is_template: true }),
    ];
    expect(containerBalance(txns, "general")).toBe(-1000);
  });

  it("a void nets its original to zero (both rows counted)", () => {
    const orig = makeTransaction({
      id: "t1",
      date: "2026-07-20",
      amount: -1000,
      vendor_source: "Starbucks",
      category_id: "coffee",
    });
    const voidRow = makeVoidRow(orig, { id: "v1" });
    expect(containerBalance([orig, voidRow], "general")).toBe(0);
  });

  it("credits a transfer destination via to_container_id (single-row transfer)", () => {
    // Transfer: single -$100 row on the source, destination credited by the 2nd term.
    const transfer = tx({
      amount: -10000,
      category_id: null,
      container_id: "general",
      to_container_id: "vacation",
      vendor_source: "General → Vacation",
    });
    expect(containerBalance([transfer], "general")).toBe(-10000); // source debited
    expect(containerBalance([transfer], "vacation")).toBe(10000); // dest credited
  });

  it("ignores containers not involved in a row", () => {
    expect(containerBalance([tx({ amount: -1000 })], "vacation")).toBe(0);
  });
});
