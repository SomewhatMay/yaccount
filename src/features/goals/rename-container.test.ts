import { describe, expect, it } from "vitest";
import { makeContainer, makeGoal } from "@/core/model";
import { renamedGoalContainer } from "@/features/goals/rename-container";

const container = makeContainer({ id: "c1", name: "Rainy day" });
const goal = makeGoal({
  id: "g1",
  container_id: container.id,
  name: container.name,
  kind: "reserve",
  mode: "passive",
  target_amount: 100_00,
  created_date: "2026-07-30",
});

describe("renamedGoalContainer", () => {
  it("renames the goal's linked container", () => {
    expect(renamedGoalContainer(goal, "Emergency fund", [container])).toEqual({
      ...container,
      name: "Emergency fund",
    });
  });

  it("returns null when the name is unchanged", () => {
    expect(renamedGoalContainer(goal, container.name, [container])).toBeNull();
  });

  it("rejects another container's name", () => {
    const existing = makeContainer({ id: "c2", name: "Emergency fund" });

    expect(() =>
      renamedGoalContainer(goal, "emergency FUND", [container, existing]),
    ).toThrow("You already have a container with that name.");
  });
});
