import { describe, it, expect } from "vitest";
import {
  makeContainer,
  makeDistributionPreset,
  makeTransaction,
  type Transaction,
} from "@/core/model";
import { replay, type Op } from "@/core/oplog";
import { STORE } from "@/core/repo/db";
import { containerBalance } from "@/core/engine/balances";
import { approvalOps } from "./approve";

const containers = [
  makeContainer({ id: "general", name: "General" }),
  makeContainer({ id: "savings", name: "Savings" }),
];
const preset = makeDistributionPreset({
  id: "p1",
  name: "Paycheck",
  rest_container_id: "general",
  parts: [{ container_id: "savings", bps: 2500 }],
});
const pending = (
  over: Partial<Parameters<typeof makeTransaction>[0]> = {},
): Transaction =>
  makeTransaction({
    id: "rule:2026-10-31",
    date: "2026-10-31",
    amount: 100000,
    vendor_source: "Paycheck",
    category_id: "salary",
    container_id: "general",
    inbox_status: "pending",
    recurring_rule_id: "rule",
    recurring_occurrence_date: "2026-10-31",
    distribution_preset_id: "p1",
    ...over,
  });

async function after(row: Transaction, ops: Op[]) {
  const state = await replay([
    {
      id: "gen",
      ts: "2026-01-01T00:00:00.000Z",
      type: "transaction.create",
      payload: { row },
    },
    ...ops,
  ]);
  return [...state.get(STORE.transactions)!.values()] as Transaction[];
}

describe("approvalOps", () => {
  it("splits an occurrence that carries a usable preset", async () => {
    const row = pending();
    const rows = await after(row, approvalOps(row, [preset], containers));
    expect(containerBalance(rows, "savings")).toBe(25000);
    expect(containerBalance(rows, "general")).toBe(75000);
  });

  it("approves plainly — and drops the stale preset — when it can't split", async () => {
    const row = pending();
    const archived = { ...preset, archived: true };
    const ops = approvalOps(row, [archived], containers);
    const rows = await after(row, ops);
    const approved = rows.find((r) => r.id === row.id)!;
    expect(approved.inbox_status).toBe("approved");
    expect(approved.distribution_preset_id).toBeNull();
    expect(rows).toHaveLength(1);
  });

  it("approves money out plainly even if a preset was recorded", async () => {
    const row = pending({ amount: -500 });
    const rows = await after(row, approvalOps(row, [preset], containers));
    expect(rows).toHaveLength(1);
    expect(rows[0].inbox_status).toBe("approved");
  });

  it("an ordinary occurrence is a single approve op", () => {
    const row = pending({ distribution_preset_id: null });
    const ops = approvalOps(row, [preset], containers);
    expect(ops.map((o) => o.type)).toEqual(["transaction.approve"]);
  });
});
