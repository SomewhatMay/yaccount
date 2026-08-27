import { describe, expect, it } from "vitest";
import {
  makeContainer,
  makeCravingWin,
  makeGoal,
  makeTransfer,
  makeVoidRow,
} from "@/core/model";
import { composeCravingWin, composeCravingWinRemoval } from "./compose";

const general = makeContainer({ id: "general", name: "General" });
const cash = makeContainer({ id: "cash", name: "Cash" });
const tripPot = makeContainer({ id: "trip-pot", name: "Japan trip" });
const bufferPot = makeContainer({ id: "buffer-pot", name: "Buffer" });
const trip = makeGoal({
  id: "trip",
  container_id: tripPot.id,
  name: "Japan trip",
  kind: "spend_down",
  mode: "passive",
  created_date: "2026-01-01",
});
const buffer = makeGoal({
  id: "buffer",
  container_id: bufferPot.id,
  name: "Buffer",
  kind: "reserve",
  mode: "passive",
  target_amount: 100_00,
  created_date: "2026-01-01",
});

const draft = {
  description: "Takeout",
  amountStr: "24.00",
  date: "2026-08-26",
  occurredAt: "2026-08-26T23:15:00.000Z",
  categoryId: null,
  reflection: "Dinner is already at home.",
  setAside: false,
  goalId: "",
  fundingContainerId: general.id,
};

function ids(...values: string[]) {
  let index = 0;
  return () => values[index++] ?? `extra-${index}`;
}

const context = {
  existing: null,
  goals: [trip, buffer],
  containers: [general, cash, tripPot, bufferPot],
  transactions: [],
};

describe("composeCravingWin", () => {
  it("logs avoided spend without changing balances", () => {
    const result = composeCravingWin(draft, { ...context, makeId: ids("win-1") });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.ops.map((op) => op.type)).toEqual(["cravingWin.create"]);
    expect(result.row).toMatchObject({
      id: "win-1",
      description: "Takeout",
      amount_kept: 2400,
      reflection: "Dinner is already at home.",
      goal_id: null,
      transfer_transaction_id: null,
    });
    expect(result.confirmation).toBeNull();
  });

  it("atomically links a full-amount real transfer to an active goal", () => {
    const result = composeCravingWin(
      { ...draft, setAside: true, goalId: trip.id },
      { ...context, makeId: ids("win-1", "transfer-1") },
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.ops.map((op) => op.type)).toEqual([
      "cravingWin.create",
      "transaction.create",
    ]);
    expect(result.row).toMatchObject({
      goal_id: trip.id,
      transfer_transaction_id: "transfer-1",
    });
    expect(result.transfer).toMatchObject({
      id: "transfer-1",
      date: draft.date,
      entered_at: draft.occurredAt,
      amount: -2400,
      container_id: general.id,
      to_container_id: tripPot.id,
      vendor_source: "Cravings Savings · Takeout",
    });
    expect(result.confirmation).toBeNull();
  });

  it("requires usable fields and a valid source → active goal route", () => {
    for (const [overrides, message] of [
      [{ description: " " }, /what.*pass/i],
      [{ amountStr: "0" }, /greater than zero/i],
      [{ amountStr: "-2" }, /greater than zero/i],
      [{ occurredAt: "not-an-instant" }, /date and time/i],
      [{ setAside: true, goalId: "missing" }, /active goal/i],
      [
        { setAside: true, goalId: trip.id, fundingContainerId: tripPot.id },
        /different container/i,
      ],
    ] as const) {
      const result = composeCravingWin(
        { ...draft, ...overrides },
        { ...context, makeId: ids("win") },
      );
      expect(result).toMatchObject({ status: "error" });
      if (result.status === "error") expect(result.message).toMatch(message);
    }
  });

  it("updates a linked transfer in place and asks before changing real money", () => {
    const transfer = makeTransfer({
      id: "transfer-1",
      date: draft.date,
      entered_at: draft.occurredAt,
      amount: 2400,
      container_id: general.id,
      to_container_id: tripPot.id,
      vendor_source: "Cravings Savings · Takeout",
    });
    const existing = makeCravingWin({
      id: "win-1",
      description: draft.description,
      amount_kept: 2400,
      date: draft.date,
      occurred_at: draft.occurredAt,
      goal_id: trip.id,
      transfer_transaction_id: transfer.id,
    });
    const result = composeCravingWin(
      {
        ...draft,
        amountStr: "30",
        setAside: true,
        goalId: buffer.id,
        fundingContainerId: cash.id,
      },
      { ...context, existing, transactions: [transfer] },
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.ops.map((op) => op.type)).toEqual([
      "cravingWin.update",
      "transaction.update",
    ]);
    expect(result.transfer).toMatchObject({
      id: transfer.id,
      amount: -3000,
      container_id: cash.id,
      to_container_id: bufferPot.id,
    });
    expect(result.confirmation?.kind).toBe("update-transfer");
  });

  it("allows non-movement edits after the linked goal is completed and archived", () => {
    const transfer = makeTransfer({
      id: "transfer-1",
      date: draft.date,
      entered_at: draft.occurredAt,
      amount: 2400,
      container_id: general.id,
      to_container_id: tripPot.id,
      vendor_source: "Cravings Savings · Takeout",
    });
    const existing = makeCravingWin({
      id: "win-1",
      description: draft.description,
      amount_kept: 2400,
      date: draft.date,
      occurred_at: draft.occurredAt,
      goal_id: trip.id,
      transfer_transaction_id: transfer.id,
    });
    const historicalGoal = {
      ...trip,
      status: "completed" as const,
      completed_date: "2026-08-26",
      is_archived: true,
    };

    const result = composeCravingWin(
      {
        ...draft,
        reflection: "Changed note only.",
        setAside: true,
        goalId: historicalGoal.id,
      },
      {
        ...context,
        existing,
        goals: [historicalGoal, buffer],
        transactions: [transfer],
      },
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.ops.map((op) => op.type)).toEqual(["cravingWin.update"]);
    expect(result.confirmation).toBeNull();
  });

  it("reverses a live transfer when unlinking, after confirmation", () => {
    const transfer = makeTransfer({
      id: "transfer-1",
      date: draft.date,
      amount: 2400,
      container_id: general.id,
      to_container_id: tripPot.id,
      fromName: general.name,
      toName: tripPot.name,
    });
    const existing = makeCravingWin({
      id: "win-1",
      description: draft.description,
      amount_kept: 2400,
      date: draft.date,
      occurred_at: draft.occurredAt,
      goal_id: trip.id,
      transfer_transaction_id: transfer.id,
    });
    const result = composeCravingWin(draft, {
      ...context,
      existing,
      transactions: [transfer],
      makeId: ids("void-1"),
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.row).toMatchObject({ goal_id: null, transfer_transaction_id: null });
    expect(result.ops.map((op) => op.type)).toEqual([
      "cravingWin.update",
      "transaction.void",
    ]);
    expect(result.ops[1].payload).toMatchObject({
      row: { reverses_id: transfer.id },
    });
    expect(result.confirmation?.kind).toBe("reverse-transfer");
  });

  it("never mutates a voided transfer; setting money aside again creates a new one", () => {
    const transfer = makeTransfer({
      id: "transfer-old",
      date: draft.date,
      amount: 2400,
      container_id: general.id,
      to_container_id: tripPot.id,
      fromName: general.name,
      toName: tripPot.name,
    });
    const reversal = makeVoidRow(transfer, { id: "void-old" });
    const existing = makeCravingWin({
      id: "win-1",
      description: draft.description,
      amount_kept: 2400,
      date: draft.date,
      occurred_at: draft.occurredAt,
      goal_id: trip.id,
      transfer_transaction_id: transfer.id,
    });

    const result = composeCravingWin(
      { ...draft, setAside: true, goalId: buffer.id },
      {
        ...context,
        existing,
        transactions: [transfer, reversal],
        makeId: ids("transfer-new"),
      },
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.ops.map((op) => op.type)).toEqual([
      "cravingWin.update",
      "transaction.create",
    ]);
    expect(result.row.transfer_transaction_id).toBe("transfer-new");
    expect(result.transfer?.id).toBe("transfer-new");
  });
});

describe("composeCravingWinRemoval", () => {
  it("can delete only the win or also reverse its still-live transfer", () => {
    const transfer = makeTransfer({
      id: "transfer-1",
      date: draft.date,
      amount: 2400,
      container_id: general.id,
      to_container_id: tripPot.id,
      fromName: general.name,
      toName: tripPot.name,
    });
    const existing = makeCravingWin({
      id: "win-1",
      description: draft.description,
      amount_kept: 2400,
      date: draft.date,
      occurred_at: draft.occurredAt,
      goal_id: trip.id,
      transfer_transaction_id: transfer.id,
    });

    expect(
      composeCravingWinRemoval(existing, [transfer], false).ops.map((op) => op.type),
    ).toEqual(["cravingWin.remove"]);

    const reversed = composeCravingWinRemoval(existing, [transfer], true, {
      makeId: ids("void-1"),
    });
    expect(reversed.ops.map((op) => op.type)).toEqual([
      "cravingWin.remove",
      "transaction.void",
    ]);
    expect(reversed.reversal).toMatchObject({
      id: "void-1",
      reverses_id: transfer.id,
    });
  });
});
