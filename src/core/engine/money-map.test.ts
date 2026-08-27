import { describe, expect, it } from "vitest";
import {
  makeContainer,
  makeContainerSnapshot,
  makeGeneralContainer,
  makeGoal,
  makeTransaction,
  type Container,
} from "@/core/model";
import { overallBalance } from "./balances";
import { moneyMap } from "./money-map";

const general = makeGeneralContainer();
const countedGoal = makeContainer({
  id: "counted-goal",
  name: "Counted goal",
  include_in_overall_balance: true,
});
const countedInvestment = makeContainer({
  id: "counted-investment",
  name: "Counted investment",
  include_in_overall_balance: true,
  is_investment: true,
});
const goalCash = makeContainer({ id: "goal-cash", name: "Goal cash" });
const goalInvestment = makeContainer({
  id: "goal-investment",
  name: "Goal investment",
  is_investment: true,
});
const investment = makeContainer({
  id: "investment",
  name: "Investment",
  is_investment: true,
});
const unvalued = makeContainer({
  id: "unvalued",
  name: "Unvalued investment",
  is_investment: true,
});
const other = makeContainer({ id: "other", name: "Other cash" });
const archived = {
  ...makeContainer({ id: "archived", name: "Archived", is_investment: true }),
  is_archived: true,
};
const containers: Container[] = [
  general,
  countedGoal,
  countedInvestment,
  goalCash,
  goalInvestment,
  investment,
  unvalued,
  other,
  archived,
];

const amounts: Record<string, number> = {
  general: 1000,
  "counted-goal": 2000,
  "counted-investment": 3000,
  "goal-cash": 4000,
  "goal-investment": 4500,
  investment: 5500,
  unvalued: 8000,
  other: 7000,
  archived: 100000,
};
const transactions = containers.map((container) =>
  makeTransaction({
    id: `row-${container.id}`,
    date: "2026-08-01",
    amount: amounts[container.id],
    vendor_source: "Opening",
    category_id: "income",
    container_id: container.id,
  }),
);
const goals = [countedGoal, goalCash, goalInvestment].map((container) =>
  makeGoal({
    id: `goal-${container.id}`,
    container_id: container.id,
    name: container.name,
    kind: "spend_down",
    mode: "passive",
    created_date: "2026-01-01",
  }),
);
const snapshots = [
  makeContainerSnapshot({
    id: "counted-snapshot",
    container_id: countedInvestment.id,
    date: "2026-08-20",
    reported_balance: 9000,
  }),
  makeContainerSnapshot({
    id: "goal-snapshot",
    container_id: goalInvestment.id,
    date: "2026-08-20",
    reported_balance: 5000,
  }),
  makeContainerSnapshot({
    id: "investment-old",
    container_id: investment.id,
    date: "2026-08-19",
    reported_balance: 5900,
  }),
  makeContainerSnapshot({
    id: "snapshot-a",
    container_id: investment.id,
    date: "2026-08-20",
    reported_balance: 6100,
  }),
  makeContainerSnapshot({
    id: "snapshot-b",
    container_id: investment.id,
    date: "2026-08-20",
    reported_balance: 6000,
  }),
  makeContainerSnapshot({
    id: "archived-snapshot",
    container_id: archived.id,
    date: "2026-08-22",
    reported_balance: 200000,
  }),
];

describe("moneyMap", () => {
  it("reconciles mutually exclusive branches to known tracked value", () => {
    const map = moneyMap(containers, snapshots, transactions, goals);

    expect(map.knownTrackedValue).toBe(28000);
    expect(map.branches.map((branch) => [branch.kind, branch.knownValue])).toEqual([
      ["counted", 6000],
      ["goals", 9000],
      ["investments", 6000],
      ["other", 7000],
    ]);
    expect(map.branches.reduce((sum, branch) => sum + branch.knownValue, 0)).toBe(
      map.knownTrackedValue,
    );
  });

  it("matches raw overall balance and never double-counts counted goals or investments", () => {
    const map = moneyMap(containers, snapshots, transactions, goals);
    const counted = map.branches.find((branch) => branch.kind === "counted")!;

    expect(counted.knownValue).toBe(overallBalance(transactions, containers));
    expect(counted.items.map((item) => item.containerId)).toEqual([
      "counted-goal",
      "counted-investment",
      "general",
    ]);
    expect(
      map.branches
        .filter((branch) => branch.kind !== "counted")
        .flatMap((branch) => branch.items.map((item) => item.containerId)),
    ).not.toEqual(expect.arrayContaining(["counted-goal", "counted-investment"]));
    expect(
      counted.items.find((item) => item.containerId === "counted-investment"),
    ).toMatchObject({ value: 3000, valuation: "ledger", isInvestment: true });
  });

  it("uses deterministic latest snapshots and reports missing values as unvalued", () => {
    const forward = moneyMap(containers, snapshots, transactions, goals);
    const reversed = moneyMap(containers, [...snapshots].reverse(), transactions, goals);
    const investmentItem = forward.branches
      .find((branch) => branch.kind === "investments")!
      .items.find((item) => item.containerId === "investment");

    expect(investmentItem).toMatchObject({
      value: 6000,
      valuation: "snapshot",
      snapshotDate: "2026-08-20",
    });
    expect(reversed).toEqual(forward);
    expect(forward.unvaluedCount).toBe(1);
    expect(
      forward.branches
        .find((branch) => branch.kind === "investments")!
        .items.find((item) => item.containerId === "unvalued"),
    ).toMatchObject({ value: null, valuation: "unvalued", snapshotDate: null });
  });

  it("excludes archived containers and gives active goals precedence outside balance", () => {
    const map = moneyMap(containers, snapshots, transactions, goals);
    const allIds = map.branches.flatMap((branch) =>
      branch.items.map((item) => item.containerId),
    );

    expect(allIds).not.toContain("archived");
    expect(map.branches.find((branch) => branch.kind === "goals")!.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          containerId: "goal-investment",
          value: 5000,
          valuation: "snapshot",
          isInvestment: true,
        }),
      ]),
    );
    expect(
      map.branches
        .find((branch) => branch.kind === "investments")!
        .items.map((item) => item.containerId),
    ).not.toContain("goal-investment");
  });
});
