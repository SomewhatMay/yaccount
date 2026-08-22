import { describe, expect, it } from "vitest";
import { isAchieved } from "@/core/engine";
import { makeGoal, makeTransfer } from "@/core/model";
import { reopenedGoal } from "@/features/goals/reopen";

const contribution = makeTransfer({
  id: "t1",
  date: "2026-08-01",
  amount: 100_00,
  container_id: "general",
  to_container_id: "goal-container",
  fromName: "General",
  toName: "Goal",
});

describe("reopenedGoal", () => {
  it("reopens a completed goal when its target is raised above contributions", () => {
    const edited = makeGoal({
      id: "g1",
      container_id: "goal-container",
      name: "Goal",
      kind: "spend_down",
      mode: "passive",
      target_amount: 200_00,
      status: "completed",
      created_date: "2026-07-01",
      completed_date: "2026-08-01",
    });

    expect(reopenedGoal(edited, [contribution])).toEqual({
      ...edited,
      status: "active",
      completed_date: null,
    });
  });

  it("keeps an achieved goal completed", () => {
    const edited = makeGoal({
      id: "g1",
      container_id: "goal-container",
      name: "Goal",
      kind: "spend_down",
      mode: "passive",
      target_amount: 100_00,
      status: "completed",
      created_date: "2026-07-01",
      completed_date: "2026-08-01",
    });

    expect(reopenedGoal(edited, [contribution])).toEqual(edited);
  });

  it("leaves a cancelled goal untouched", () => {
    const edited = makeGoal({
      id: "g1",
      container_id: "goal-container",
      name: "Goal",
      kind: "spend_down",
      mode: "passive",
      target_amount: 200_00,
      status: "cancelled",
      created_date: "2026-07-01",
      completed_date: "2026-08-01",
    });

    expect(reopenedGoal(edited, [contribution])).toEqual(edited);
  });

  it("leaves a reserve goal untouched", () => {
    const edited = makeGoal({
      id: "g1",
      container_id: "goal-container",
      name: "Goal",
      kind: "reserve",
      mode: "passive",
      target_amount: 200_00,
      status: "completed",
      created_date: "2026-07-01",
      completed_date: "2026-08-01",
    });

    expect(reopenedGoal(edited, [contribution])).toEqual(edited);
  });

  it("makes a lowered active target eligible for goal maintenance", () => {
    const edited = makeGoal({
      id: "g1",
      container_id: "goal-container",
      name: "Goal",
      kind: "spend_down",
      mode: "passive",
      target_amount: 50_00,
      status: "active",
      created_date: "2026-07-01",
    });

    expect(isAchieved(reopenedGoal(edited, [contribution]), [contribution])).toBe(true);
  });
});
