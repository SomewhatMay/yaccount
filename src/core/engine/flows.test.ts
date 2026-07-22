import { describe, it, expect } from "vitest";
import { makeContainer, makeGeneralContainer } from "../model/container";
import { makeContainerSnapshot } from "../model/containerSnapshot";
import { makeTransaction, makeTransfer } from "../model/transaction";
import type { Transaction } from "../model";
import { containerFlows, unrealizedGainLoss, reconstructedBalance } from "./flows";
import { resolvePeriod } from "./period";

const general = makeGeneralContainer();
const savings = makeContainer({ name: "Savings", id: "savings", is_investment: true });
const gone = makeContainer({ name: "Old", id: "gone" });
gone.is_archived = true;
const containers = [general, savings, gone];

const txns: Transaction[] = [
  // two contributions into savings (May, Jun) and one withdrawal out (Jul)
  makeTransfer({
    date: "2026-05-05",
    amount: 100000,
    container_id: "general",
    to_container_id: "savings",
    fromName: "General",
    toName: "Savings",
  }),
  makeTransfer({
    date: "2026-06-05",
    amount: 50000,
    container_id: "general",
    to_container_id: "savings",
    fromName: "General",
    toName: "Savings",
  }),
  makeTransfer({
    date: "2026-07-05",
    amount: 20000,
    container_id: "savings",
    to_container_id: "general",
    fromName: "Savings",
    toName: "General",
  }),
  // an expense out of general — not a transfer, must not appear in flows
  makeTransaction({
    date: "2026-06-10",
    amount: -8000,
    vendor_source: "Mart",
    category_id: "groc",
  }),
];

const range = resolvePeriod({ kind: "preset", preset: "all" }, "2026-07-21");

describe("containerFlows — net transfer in/out per container (§5.4)", () => {
  it("counts only transfers, both directions, skipping archived containers", () => {
    const flows = containerFlows(txns, containers, range);
    expect(flows.find((f) => f.containerId === "gone")).toBeUndefined();
    expect(flows.find((f) => f.containerId === "savings")).toEqual({
      containerId: "savings",
      name: "Savings",
      inflow: 150000, // 100 + 50 in
      outflow: 20000, // 20 out
      net: 130000,
    });
    expect(flows.find((f) => f.containerId === "general")).toEqual({
      containerId: "general",
      name: "General",
      inflow: 20000, // the withdrawal landed here
      outflow: 150000, // the two contributions left here
      net: -130000,
    });
  });

  it("respects the window (only in-range transfers count)", () => {
    const may = resolvePeriod(
      { kind: "custom", start: "2026-05-01", end: "2026-05-31" },
      "2026-07-21",
    );
    expect(
      containerFlows(txns, containers, may).find((f) => f.containerId === "savings"),
    ).toEqual({
      containerId: "savings",
      name: "Savings",
      inflow: 100000,
      outflow: 0,
      net: 100000,
    });
  });
});

describe("unrealizedGainLoss — Current Value − Net Contributions (§5.6)", () => {
  it("uses the latest snapshot and nets contributions two-directionally", () => {
    // net contributions into savings = 100 + 50 − 20 = 130000
    const snaps = [
      makeContainerSnapshot({
        container_id: "savings",
        date: "2026-06-30",
        reported_balance: 140000,
      }),
      makeContainerSnapshot({
        container_id: "savings",
        date: "2026-07-20",
        reported_balance: 145000,
      }), // latest wins
    ];
    // 145000 − 130000 = 15000 gain
    expect(unrealizedGainLoss("savings", snaps, txns)).toBe(15000);
  });

  it("is null when the container has never been snapshotted", () => {
    expect(unrealizedGainLoss("savings", [], txns)).toBeNull();
  });
});

describe("reconstructedBalance — nearest snapshot ± transfers in the gap (§5.6 / §10 #4)", () => {
  const snaps = [
    makeContainerSnapshot({
      container_id: "savings",
      date: "2026-06-06",
      reported_balance: 150000,
    }),
  ];

  it("rolls a past snapshot FORWARD by later transfers (two-directional)", () => {
    // snapshot 150000 on Jun 6 (after the two contributions); the Jul 5 −20000 withdrawal follows.
    expect(reconstructedBalance("savings", snaps, txns, "2026-07-10")).toBe(130000);
  });

  it("rolls a future snapshot BACKWARD across the gap", () => {
    // As of May 20 (before Jun 5's +50000), reconstruct back from the Jun 6 snapshot: 150000 − 50000 = 100000.
    expect(reconstructedBalance("savings", snaps, txns, "2026-05-20")).toBe(100000);
  });

  it("returns the snapshot value when nothing moved in the gap", () => {
    // target Jun 30: the only later transfer (Jul 5) is past the target, so the gap is empty.
    expect(reconstructedBalance("savings", snaps, txns, "2026-06-30")).toBe(150000);
  });

  it("is null with no snapshots for the container", () => {
    expect(reconstructedBalance("savings", [], txns, "2026-07-10")).toBeNull();
  });
});
