import { describe, it, expect } from "vitest";
import { createDistributedIncome } from "@/core/commands";
import { splitIncome } from "@/core/engine/distribution";
import { activeRows } from "@/core/engine/ledger";
import { containerBalance } from "@/core/engine/balances";
import {
  makeContainer,
  makeDistributionPreset,
  makeTransaction,
  type Transaction,
} from "@/core/model";
import { replay, type Op } from "@/core/oplog";
import { STORE } from "@/core/repo/db";
import { editOps, needsResplit } from "./edit-distribution";

const containers = [
  makeContainer({ id: "general", name: "General" }),
  makeContainer({ id: "savings", name: "Savings" }),
  makeContainer({ id: "wallet", name: "Wallet" }),
];
const p1 = makeDistributionPreset({
  id: "p1",
  name: "Paycheck",
  rest_container_id: "general",
  parts: [{ container_id: "savings", bps: 2500 }],
});
const p2 = makeDistributionPreset({
  id: "p2",
  name: "Half",
  rest_container_id: "general",
  parts: [{ container_id: "savings", bps: 5000 }],
});

async function rowsOf(ops: Op[]): Promise<Transaction[]> {
  const state = await replay(ops);
  return [...state.get(STORE.transactions)!.values()] as Transaction[];
}

async function seeded() {
  const split = splitIncome(100000, p1, containers);
  if (!split.ok) throw new Error("split");
  const ops = createDistributedIncome(
    {
      id: "pay",
      date: "2026-10-01",
      amount: 100000,
      vendor_source: "Paycheck",
      category_id: "salary",
      preset_id: "p1",
      split,
    },
    { ts: "2026-10-01T09:00:00.000Z" },
  );
  const rows = await rowsOf(ops);
  return { ops, rows, tx: activeRows(rows).find((r) => r.id === "pay")! };
}

const T2 = { ts: "2026-10-01T10:00:00.000Z" };

describe("editOps — a split income", () => {
  it("keeps the pieces' cents on a payee-only edit", async () => {
    const { ops, rows, tx } = await seeded();
    const out = editOps(
      {
        tx,
        next: { ...tx, vendor_source: "Acme" },
        moneyIn: true,
        distribute: true,
        presetId: "p1",
      },
      { presets: [p1], containers, transactions: rows },
      T2,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const after = await rowsOf([...ops, ...out.ops]);
    expect(containerBalance(after, "savings")).toBe(25000);
  });

  it("re-splits at the chosen preset's current shares", async () => {
    const { ops, rows, tx } = await seeded();
    const out = editOps(
      { tx, next: tx, moneyIn: true, distribute: true, presetId: "p2" },
      { presets: [p1, p2], containers, transactions: rows },
      T2,
    );
    if (!out.ok) throw new Error(out.error);
    const after = await rowsOf([...ops, ...out.ops]);
    expect(containerBalance(after, "savings")).toBe(50000);
  });

  it("keeps the split when its preset was archived and nothing it depends on changed", async () => {
    const { ops, rows, tx } = await seeded();
    const archived = { ...p1, archived: true };
    const out = editOps(
      {
        tx,
        next: { ...tx, notes: "hi" },
        moneyIn: true,
        distribute: true,
        presetId: null,
      },
      { presets: [archived], containers, transactions: rows },
      T2,
    );
    if (!out.ok) throw new Error(out.error);
    const after = await rowsOf([...ops, ...out.ops]);
    expect(containerBalance(after, "savings")).toBe(25000);
  });

  it("asks for a preset when the amount changes and the old one can't split", async () => {
    const { rows, tx } = await seeded();
    const out = editOps(
      {
        tx,
        next: { ...tx, amount: 200000 },
        moneyIn: true,
        distribute: true,
        presetId: null,
      },
      { presets: [{ ...p1, archived: true }], containers, transactions: rows },
    );
    expect(out).toEqual({
      ok: false,
      error: "Pick a distribution to split this income.",
    });
  });

  it("turning it into an expense drops the split — no hidden checkbox to untick", async () => {
    const { ops, rows, tx } = await seeded();
    const out = editOps(
      {
        tx,
        next: { ...tx, amount: -100000, category_id: "rent", container_id: "wallet" },
        moneyIn: false,
        distribute: true,
        presetId: "p1",
      },
      { presets: [p1], containers, transactions: rows },
      T2,
    );
    if (!out.ok) throw new Error(out.error);
    const after = await rowsOf([...ops, ...out.ops]);
    expect(containerBalance(after, "savings")).toBe(0);
    expect(containerBalance(after, "wallet")).toBe(-100000);
    expect(after.find((r) => r.id === "pay")?.distribution_preset_id).toBeNull();
  });

  it("untick lands the whole income in the picked container", async () => {
    const { ops, rows, tx } = await seeded();
    const out = editOps(
      {
        tx,
        next: { ...tx, container_id: "wallet" },
        moneyIn: true,
        distribute: false,
        presetId: "p1",
      },
      { presets: [p1], containers, transactions: rows },
      T2,
    );
    if (!out.ok) throw new Error(out.error);
    const after = await rowsOf([...ops, ...out.ops]);
    expect(containerBalance(after, "wallet")).toBe(100000);
    expect(containerBalance(after, "general")).toBe(0);
    expect(containerBalance(after, "savings")).toBe(0);
  });
});

describe("editOps — a plain income", () => {
  const plain = makeTransaction({
    id: "gift",
    date: "2026-10-01",
    amount: 100000,
    vendor_source: "Gift",
    category_id: "salary",
    container_id: "wallet",
  });

  it("is a single update when Distribute stays off", () => {
    const out = editOps(
      {
        tx: plain,
        next: { ...plain, notes: "x" },
        moneyIn: true,
        distribute: false,
        presetId: null,
      },
      { presets: [p1], containers, transactions: [plain] },
    );
    expect(out.ok && out.ops.map((o) => o.type)).toEqual(["transaction.update"]);
  });

  it("ticking Distribute splits it into the preset's rest", async () => {
    const seed: Op = {
      id: "s",
      ts: "2026-10-01T09:00:00.000Z",
      type: "transaction.create",
      payload: { row: plain },
    };
    const out = editOps(
      { tx: plain, next: plain, moneyIn: true, distribute: true, presetId: "p1" },
      { presets: [p1], containers, transactions: [plain] },
      T2,
    );
    if (!out.ok) throw new Error(out.error);
    const after = await rowsOf([seed, ...out.ops]);
    expect(containerBalance(after, "wallet")).toBe(0);
    expect(containerBalance(after, "general")).toBe(75000);
    expect(containerBalance(after, "savings")).toBe(25000);
  });
});

describe("editOps — a pending occurrence", () => {
  const pending = makeTransaction({
    id: "r:2026-10-31",
    date: "2026-10-31",
    amount: 100000,
    vendor_source: "Pay",
    category_id: "salary",
    container_id: "wallet",
    inbox_status: "pending",
    recurring_rule_id: "r",
    recurring_occurrence_date: "2026-10-31",
  });

  it("only records the preset (and its rest) — Approve writes the pieces", () => {
    const out = editOps(
      { tx: pending, next: pending, moneyIn: true, distribute: true, presetId: "p1" },
      { presets: [p1], containers, transactions: [pending] },
    );
    if (!out.ok) throw new Error(out.error);
    expect(out.ops).toHaveLength(1);
    const op = out.ops[0];
    if (op.type !== "transaction.update") throw new Error("narrow");
    expect(op.payload.row.distribution_preset_id).toBe("p1");
    expect(op.payload.row.container_id).toBe("general");
    expect(op.payload.row.inbox_status).toBe("pending");
  });
});

describe("needsResplit", () => {
  it("is false for a payee-only edit and true for amount or preset changes", async () => {
    const { tx } = await seeded();
    const base = { tx, distribute: true, moneyIn: true, wasDistributed: true };
    expect(needsResplit({ ...base, amount: tx.amount, presetId: "p1" })).toBe(false);
    expect(needsResplit({ ...base, amount: 1, presetId: "p1" })).toBe(true);
    expect(needsResplit({ ...base, amount: tx.amount, presetId: "p2" })).toBe(true);
    expect(needsResplit({ ...base, amount: tx.amount, presetId: null })).toBe(false);
  });
});
