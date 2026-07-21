import { describe, it, expect } from "vitest";
import { makeTransaction, makeVoidRow, type Transaction } from "@/core/model";

describe("makeTransaction (§5.4 expense/income shape)", () => {
  it("derives yearMonth from date and defaults the expense/income shape", () => {
    const t = makeTransaction({
      date: "2026-07-20",
      amount: -1000,
      vendor_source: "Starbucks",
      category_id: "coffee",
    });
    expect(t.yearMonth).toBe("2026-07");
    expect(t.category_id).toBe("coffee");
    expect(t.to_container_id).toBeNull(); // not a transfer
    expect(t.container_id).toBe("general"); // implicit default wallet (M2)
    expect(t.is_template).toBe(false);
    expect(t.inbox_status).toBe("approved");
    expect(t.reverses_id).toBeNull();
    expect(t.id.length).toBeGreaterThan(0);
  });

  it("keeps the caller-supplied sign (sign ⟂ type is a UI default, §10 #13)", () => {
    const credit = makeTransaction({
      date: "2026-07-20",
      amount: 5000, // a +$50 refund against an expense category
      vendor_source: "Amazon refund",
      category_id: "shopping",
    });
    expect(credit.amount).toBe(5000);
  });
});

describe("makeVoidRow (§0.3 — reversing row, never a destructive delete)", () => {
  const orig: Transaction = makeTransaction({
    id: "t1",
    date: "2026-07-20",
    amount: -1000,
    vendor_source: "Starbucks",
    category_id: "coffee",
  });

  it("negates the amount and links back via reverses_id", () => {
    const v = makeVoidRow(orig, { id: "v1" });
    expect(v.id).toBe("v1");
    expect(v.amount).toBe(1000); // opposite sign → nets to zero with the original
    expect(v.reverses_id).toBe("t1");
    expect(v.category_id).toBe("coffee"); // same category so it nets in-category
    expect(v.id).not.toBe(orig.id); // a NEW row; original is untouched
  });

  it("defaults its date to the original but re-derives yearMonth when moved", () => {
    expect(makeVoidRow(orig).yearMonth).toBe("2026-07");
    expect(makeVoidRow(orig, { on: "2026-08-01" }).yearMonth).toBe("2026-08");
  });

  it("does not produce -0 when voiding a zero-amount row", () => {
    const zero = makeTransaction({
      date: "2026-07-20",
      amount: 0,
      vendor_source: "adjustment",
      category_id: "misc",
    });
    expect(Object.is(makeVoidRow(zero).amount, 0)).toBe(true);
  });
});
