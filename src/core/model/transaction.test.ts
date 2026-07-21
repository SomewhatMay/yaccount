import { describe, it, expect } from "vitest";
import {
  makeTransaction,
  makeTransfer,
  makeVoidRow,
  type Transaction,
} from "@/core/model";
import { containerBalance } from "@/core/engine/balances";

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

describe("makeTransaction — guards at the entry edge", () => {
  const base = {
    date: "2026-07-20",
    vendor_source: "Starbucks",
    category_id: "coffee",
  };

  it("rejects a non-integer or unsafe amount (integer cents only, §1)", () => {
    expect(() => makeTransaction({ ...base, amount: 10.5 })).toThrow();
    expect(() => makeTransaction({ ...base, amount: 1e20 })).toThrow();
  });

  it("rejects a date that is not a real calendar day (§8.3 index key)", () => {
    // A bogus month yields a yearMonth bucket no report will ever query.
    expect(() =>
      makeTransaction({ ...base, amount: -100, date: "2026-13-45" }),
    ).toThrow();
    expect(() =>
      makeTransaction({ ...base, amount: -100, date: "2026-02-30" }),
    ).toThrow();
    expect(() => makeTransaction({ ...base, amount: -100, date: "2026-7-1" })).toThrow();
  });

  it("normalizes -0 like every other amount path", () => {
    expect(Object.is(makeTransaction({ ...base, amount: -0 }).amount, 0)).toBe(true);
  });
});

describe("makeVoidRow — the reversal must stay a faithful mirror", () => {
  it("preserves to_container_id so a voided TRANSFER nets on both sides", () => {
    const transfer = makeTransfer({
      id: "t1",
      date: "2026-07-20",
      amount: 10000,
      container_id: "general",
      to_container_id: "vacation",
      fromName: "General",
      toName: "Vacation",
    });
    const v = makeVoidRow(transfer, { id: "v1" });
    expect(v.to_container_id).toBe("vacation");
    expect(v.category_id).toBeNull();
    expect(v.amount).toBe(10000);
    // §5.4 identity, both legs: source refunded, destination debited.
    expect(containerBalance([transfer, v], "general")).toBe(0);
    expect(containerBalance([transfer, v], "vacation")).toBe(0);
  });

  it("derives yearMonth across a year boundary", () => {
    const orig = makeTransaction({
      date: "2026-12-31",
      amount: -1000,
      vendor_source: "NYE",
      category_id: "fun",
    });
    expect(makeVoidRow(orig, { on: "2027-01-01" }).yearMonth).toBe("2027-01");
  });

  it("refuses to void a template — a template is not a ledger entry (§5.4)", () => {
    const tpl = {
      ...makeTransaction({
        date: "2026-07-20",
        amount: -1000,
        vendor_source: "Tims",
        category_id: "coffee",
      }),
      is_template: true,
    };
    expect(() => makeVoidRow(tpl)).toThrow();
  });
});
