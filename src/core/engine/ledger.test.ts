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

describe("activeRows — multi-device and malformed chains", () => {
  const t1 = expense("t1", -1000);

  it("two devices deleting the same row: undoing ONE keeps it hidden", () => {
    const v1 = makeVoidRow(t1, { id: "v1" });
    const v2 = makeVoidRow(t1, { id: "v2" }); // independent delete on device B
    const u1 = makeVoidRow(v1, { id: "u1" }); // undo only the first
    expect(activeRows([t1, v1, v2, u1])).toEqual([]);
    expect(isVoided([t1, v1, v2, u1], "t1")).toBe(true);
  });

  it("tracks a deep chain: delete → undo → redo → un-redo", () => {
    const v1 = makeVoidRow(t1, { id: "v1" });
    const u1 = makeVoidRow(v1, { id: "u1" });
    const r1 = makeVoidRow(u1, { id: "r1" }); // undo the undo → deleted again
    const r2 = makeVoidRow(r1, { id: "r2" }); // and back
    expect(activeRows([t1, v1]).length).toBe(0);
    expect(activeRows([t1, v1, u1]).length).toBe(1);
    expect(activeRows([t1, v1, u1, r1]).length).toBe(0);
    expect(activeRows([t1, v1, u1, r1, r2]).length).toBe(1);
    expect(containerBalance([t1, v1, u1, r1, r2], "general")).toBe(-1000);
  });

  it("gives the same answer whatever order the rows arrive in (§8.5 convergence)", () => {
    const v1 = makeVoidRow(t1, { id: "v1" });
    const u1 = makeVoidRow(v1, { id: "u1" });
    const rows = [t1, v1, u1];
    const forward = activeRows(rows).map((r) => r.id);
    const backward = activeRows([...rows].reverse()).map((r) => r.id);
    expect(backward).toEqual(forward);
  });

  it("is deterministic even on malformed, cyclic reverses_id", () => {
    // Not producible by the app, but a corrupt or hand-edited ledger must not
    // make two devices disagree about what is on screen.
    const a: Transaction = { ...expense("a", -100), reverses_id: "b" };
    const b: Transaction = { ...expense("b", 100), reverses_id: "a" };
    expect(activeRows([a, b])).toEqual(activeRows([b, a]));
    expect(isVoided([a, b], "a")).toBe(isVoided([b, a], "a"));
  });

  it("ignores a self-reversing row", () => {
    const s: Transaction = { ...expense("s", -100), reverses_id: "s" };
    expect(activeRows([s])).toEqual([]);
  });

  it("drops a dangling reversal whose target it has not seen (§8.4 archived segments)", () => {
    const orphan: Transaction = { ...expense("o", 100), reverses_id: "gone" };
    expect(activeRows([t1, orphan]).map((r) => r.id)).toEqual(["t1"]);
    expect(isVoided([t1, orphan], "gone")).toBe(false);
    // Its amount still counts — visible rows deliberately do not sum to balance.
    expect(containerBalance([t1, orphan], "general")).toBe(-900);
  });

  it("a PENDING reversal does not hide its target — it moves no money yet (§10 #2)", () => {
    const v: Transaction = { ...makeVoidRow(t1, { id: "v1" }), inbox_status: "pending" };
    expect(activeRows([t1, v]).map((r) => r.id)).toEqual(["t1"]);
    expect(containerBalance([t1, v], "general")).toBe(-1000);
  });

  it("a TEMPLATE reversal does not hide its target either", () => {
    const v: Transaction = { ...makeVoidRow(t1, { id: "v1" }), is_template: true };
    expect(activeRows([t1, v]).map((r) => r.id)).toEqual(["t1"]);
  });

  it("never returns templates", () => {
    const tpl: Transaction = { ...expense("tpl", -500), is_template: true };
    expect(activeRows([t1, tpl]).map((r) => r.id)).toEqual(["t1"]);
  });

  it("returns rows in input order and reports unknown ids as not voided", () => {
    const t2 = expense("t2", -250);
    expect(activeRows([t2, t1]).map((r) => r.id)).toEqual(["t2", "t1"]);
    expect(isVoided([t1], "nope")).toBe(false);
  });
});
