import { describe, expect, it } from "vitest";
import { makeGoal, makeRecurringRule, makeTransfer, makeVoidRow } from "@/core/model";
import { goalMaintenanceOps } from "./maintenance";

const goal = makeGoal({
  id: "goal-1",
  container_id: "goal-pot",
  name: "Trip",
  kind: "spend_down",
  mode: "passive",
  target_amount: 100_00,
  created_date: "2026-01-01",
});
const contribution = makeTransfer({
  id: "transfer-1",
  date: "2026-08-26",
  amount: 100_00,
  container_id: "general",
  to_container_id: "goal-pot",
  fromName: "General",
  toName: "Trip",
});
const rule = makeRecurringRule({
  id: "rule-1",
  frequency: "monthly",
  interval_config: { day_of_month: 1 },
  template_vendor_source: "Save toward Trip",
  template_amount: 100_00,
  template_container_id: "general",
  template_category_id: null,
  template_to_container_id: "goal-pot",
  linked_goal_id: goal.id,
  start_date: "2026-01-01",
});

describe("goalMaintenanceOps", () => {
  it("completes newly achieved goals and cancels their active rule", () => {
    expect(
      goalMaintenanceOps([goal], [contribution], [rule], "2026-08-26").map(
        (op) => op.type,
      ),
    ).toEqual(["goal.complete", "recurringRule.cancel"]);
  });

  it("reopens a completed goal when a corrected contribution no longer reaches it", () => {
    const completed = {
      ...goal,
      status: "completed" as const,
      completed_date: "2026-08-26",
    };
    const reversal = makeVoidRow(contribution, { id: "void-1" });
    const ops = goalMaintenanceOps(
      [completed],
      [contribution, reversal],
      [{ ...rule, status: "cancelled" }],
      "2026-08-27",
    );

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      type: "goal.update",
      payload: { row: { id: goal.id, status: "active", completed_date: null } },
    });
  });

  it("leaves cancelled and reserve goals alone", () => {
    const cancelled = { ...goal, status: "cancelled" as const };
    const reserve = makeGoal({
      ...goal,
      id: "reserve",
      kind: "reserve",
      target_amount: 100_00,
    });
    expect(
      goalMaintenanceOps([cancelled, reserve], [contribution], [], "2026-08-26"),
    ).toEqual([]);
  });
});
