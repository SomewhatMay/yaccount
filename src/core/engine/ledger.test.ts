import { describe, it, expect } from "vitest";
import { activeRows, isVoided } from "./ledger";
import { containerBalance } from "./balances";
import { makeTransaction, makeVoidRow, type Transaction } from "../model";

const expense = (id: string, amount: number): Transaction =>
  makeTransaction({
    id,
    date: "2026-07-20",
    amount,
    vendor_source: `row-${id}`,
    category_id: "coffee",
  });

describe("activeRows — a void can itself be undone (undo is first-class)", () => {
  const t1 = expense("t1", -1000);

  it("shows a plain row", () => {
    expect(activeRows([t1]).map((r) => r.id)).toEqual(["t1"]);
    expect(isVoided([t1], "t1")).toBe(false);
  });

  it("hides both halves of a void", () => {
    const v1 = makeVoidRow(t1, { id: "v1" });
    expect(activeRows([t1, v1])).toEqual([]);
    expect(isVoided([t1, v1], "t1")).toBe(true);
    expect(containerBalance([t1, v1], "general")).toBe(0);
  });

  it("brings the original back when the void is itself voided (undo delete)", () => {
    const v1 = makeVoidRow(t1, { id: "v1" });
    const u1 = makeVoidRow(v1, { id: "u1" }); // undo: reverses the reversal
    expect(activeRows([t1, v1, u1]).map((r) => r.id)).toEqual(["t1"]);
    expect(isVoided([t1, v1, u1], "t1")).toBe(false);
    expect(containerBalance([t1, v1, u1], "general")).toBe(-1000); // back to the original
  });

  it("re-deleting after an undo hides it again (redo)", () => {
    const v1 = makeVoidRow(t1, { id: "v1" });
    const u1 = makeVoidRow(v1, { id: "u1" });
    const v2 = makeVoidRow(t1, { id: "v2" }); // delete once more
    expect(activeRows([t1, v1, u1, v2])).toEqual([]);
    expect(containerBalance([t1, v1, u1, v2], "general")).toBe(0);
  });

  it("keeps a genuine refund visible — it reverses nothing", () => {
    const refund = expense("r1", 400); // opposite sign, reverses_id null
    expect(
      activeRows([t1, refund])
        .map((r) => r.id)
        .sort(),
    ).toEqual(["r1", "t1"]);
  });

  it("leaves templates and unrelated rows alone", () => {
    const other = expense("t2", -250);
    const v1 = makeVoidRow(t1, { id: "v1" });
    expect(activeRows([t1, v1, other]).map((r) => r.id)).toEqual(["t2"]);
  });
});
