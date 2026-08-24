import { describe, expect, it } from "vitest";
import { makeContainer, makeGoal, makeTransfer, type Goal } from "@/core/model";
import { goalOutlook } from "./goal-outlook";

const deadlineContainer = makeContainer({ id: "deadline-c", name: "Portugal" });
const fixedContainer = makeContainer({ id: "fixed-c", name: "Laptop" });
const passiveContainer = makeContainer({ id: "passive-c", name: "Buffer" });
const reserveContainer = makeContainer({ id: "reserve-c", name: "Reserve" });
const containers = [
  deadlineContainer,
  fixedContainer,
  passiveContainer,
  reserveContainer,
];

function contribution(
  id: string,
  containerId: string,
  amount: number,
  status: "pending" | "approved" = "approved",
) {
  return makeTransfer({
    id,
    date: "2026-07-01",
    amount,
    container_id: "general",
    to_container_id: containerId,
    fromName: "General",
    toName: containerId,
    inbox_status: status,
  });
}

const deadline = makeGoal({
  id: "deadline",
  container_id: deadlineContainer.id,
  name: "Portugal",
  kind: "spend_down",
  mode: "deadline",
  target_amount: 12_000,
  deadline: "2026-11-30",
  created_date: "2026-01-01",
});
const fixed = makeGoal({
  id: "fixed",
  container_id: fixedContainer.id,
  name: "Laptop",
  kind: "spend_down",
  mode: "fixed",
  target_amount: 20_000,
  planned_monthly: 5_000,
  created_date: "2026-01-01",
});
const passive = makeGoal({
  id: "passive",
  container_id: passiveContainer.id,
  name: "Loose buffer",
  kind: "spend_down",
  mode: "passive",
  target_amount: 10_000,
  created_date: "2026-01-01",
});

describe("goalOutlook", () => {
  it("derives deadline, fixed, and passive rows through the existing goal engines", () => {
    const outlook = goalOutlook(
      [deadline, fixed, passive],
      containers,
      [
        contribution("fixed-in", fixedContainer.id, 5_000),
        contribution("passive-in", passiveContainer.id, 2_500),
      ],
      "2026-08-23",
    );

    expect(outlook.totalMonthly).toBe(8_000);
    expect(outlook.rows.find((row) => row.goalId === deadline.id)).toMatchObject({
      mode: "deadline",
      basis: 0,
      target: 12_000,
      progress: 0,
      monthlyAsk: 3_000,
      deadline: "2026-11-30",
      projectedCompletion: null,
      status: "on-track",
    });
    expect(outlook.rows.find((row) => row.goalId === fixed.id)).toMatchObject({
      mode: "fixed",
      basis: 5_000,
      progress: 0.25,
      monthlyAsk: 5_000,
      projectedCompletion: "2026-11-23",
      status: "on-track",
    });
    expect(outlook.rows.find((row) => row.goalId === passive.id)).toMatchObject({
      mode: "passive",
      basis: 2_500,
      progress: 0.25,
      monthlyAsk: 0,
      projectedCompletion: null,
      status: "passive",
    });
  });

  it("uses live balance for reserves and approved contributions for spend-down goals", () => {
    const reserve = makeGoal({
      id: "reserve",
      container_id: reserveContainer.id,
      name: "Emergency reserve",
      kind: "reserve",
      mode: "fixed",
      target_amount: 10_000,
      planned_monthly: 1_000,
      created_date: "2026-01-01",
    });
    const pending = contribution("pending", fixedContainer.id, 9_000, "pending");
    const outlook = goalOutlook(
      [reserve, fixed],
      containers,
      [contribution("reserve-in", reserveContainer.id, 7_000), pending],
      "2026-08-23",
    );

    expect(outlook.rows.find((row) => row.goalId === reserve.id)).toMatchObject({
      kind: "reserve",
      basis: 7_000,
      progress: 0.7,
    });
    expect(outlook.rows.find((row) => row.goalId === fixed.id)).toMatchObject({
      kind: "spend_down",
      basis: 0,
      progress: 0,
    });
  });

  it("does not invent completion for fixed or passive goals without targets", () => {
    const openFixed = makeGoal({
      id: "open-fixed",
      container_id: fixedContainer.id,
      name: "Open fixed",
      kind: "spend_down",
      mode: "fixed",
      planned_monthly: 1_500,
      created_date: "2026-01-01",
    });
    const openPassive = makeGoal({
      id: "open-passive",
      container_id: passiveContainer.id,
      name: "Open passive",
      kind: "spend_down",
      mode: "passive",
      created_date: "2026-01-01",
    });
    const rows = goalOutlook([openFixed, openPassive], containers, [], "2026-08-23").rows;

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          goalId: openFixed.id,
          progress: null,
          monthlyAsk: 1_500,
          projectedCompletion: null,
        }),
        expect.objectContaining({
          goalId: openPassive.id,
          progress: null,
          monthlyAsk: 0,
          projectedCompletion: null,
        }),
      ]),
    );
  });

  it("flags a short past-deadline goal for a plain-language plan change", () => {
    const late = makeGoal({
      ...deadline,
      id: "late",
      deadline: "2026-07-31",
    });
    const row = goalOutlook([late], containers, [], "2026-08-23").rows[0];

    expect(row).toMatchObject({
      monthlyAsk: 12_000,
      requiresReplan: true,
      status: "needs-change",
    });
  });

  it("removes completed, cancelled, and archived goals from the active view deterministically", () => {
    const inactive: Goal[] = [
      makeGoal({ ...deadline, id: "completed", status: "completed" }),
      makeGoal({ ...deadline, id: "cancelled", status: "cancelled" }),
      makeGoal({ ...deadline, id: "archived", is_archived: true }),
    ];
    const forward = goalOutlook(
      [...inactive, fixed, deadline],
      containers,
      [],
      "2026-08-23",
    );
    const reversed = goalOutlook(
      [deadline, fixed, ...inactive].reverse(),
      containers,
      [],
      "2026-08-23",
    );

    expect(forward.rows.map((row) => row.goalId).sort()).toEqual([deadline.id, fixed.id]);
    expect(reversed).toEqual(forward);
  });
});
