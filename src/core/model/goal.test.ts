import { describe, it, expect } from "vitest";
import { GoalSchema, makeGoal } from "@/core/model";

/**
 * Cross-field integrity rules (§5.9.2/.4), owned by M7. The M1 schema only fixed
 * field types + enum CHECKs; the mode/kind invariants live here.
 */

const base = {
  container_id: "clothing",
  created_date: "2026-01-01",
};

describe("GoalSchema cross-field refinements (§5.9.2/.4)", () => {
  it("deadline mode requires both a deadline and a target", () => {
    // valid: deadline + target present
    expect(() =>
      makeGoal({
        ...base,
        kind: "spend_down",
        mode: "deadline",
        target_amount: 20000,
        deadline: "2026-11-30",
      }),
    ).not.toThrow();
    // missing deadline
    expect(() =>
      makeGoal({ ...base, kind: "spend_down", mode: "deadline", target_amount: 20000 }),
    ).toThrow();
    // missing target
    expect(() =>
      makeGoal({
        ...base,
        kind: "spend_down",
        mode: "deadline",
        deadline: "2026-11-30",
      }),
    ).toThrow();
  });

  it("fixed mode requires planned_monthly; target is optional (open-ended allowed)", () => {
    expect(() =>
      makeGoal({
        ...base,
        kind: "spend_down",
        mode: "fixed",
        planned_monthly: 5000,
      }),
    ).not.toThrow();
    // open-ended fixed (no target) is allowed (§5.9.7)
    expect(() =>
      makeGoal({
        ...base,
        kind: "spend_down",
        mode: "fixed",
        planned_monthly: 5000,
        target_amount: null,
      }),
    ).not.toThrow();
    // fixed without a committed monthly is invalid
    expect(() =>
      makeGoal({ ...base, kind: "spend_down", mode: "fixed" }),
    ).toThrow();
  });

  it("planned_monthly is only allowed in fixed mode (null for deadline/passive)", () => {
    // deadline derives its ask — a stored planned_monthly is contradictory
    expect(() =>
      GoalSchema.parse({
        id: "g",
        ...base,
        name: null,
        kind: "spend_down",
        mode: "deadline",
        target_amount: 20000,
        deadline: "2026-11-30",
        planned_monthly: 5000,
        opening_contributed: 0,
        status: "active",
        is_archived: false,
        completed_date: null,
      }),
    ).toThrow();
  });

  it("reserve kind requires a target (a set-point, §5.9.3)", () => {
    expect(() =>
      makeGoal({ ...base, kind: "reserve", mode: "deadline", deadline: "2026-11-30", target_amount: 1000000 }),
    ).not.toThrow();
    expect(() =>
      makeGoal({ ...base, kind: "reserve", mode: "passive" }),
    ).toThrow();
  });

  it("passive mode tracks with no ask; target optional", () => {
    expect(() =>
      makeGoal({ ...base, kind: "spend_down", mode: "passive" }),
    ).not.toThrow();
    expect(() =>
      makeGoal({
        ...base,
        kind: "spend_down",
        mode: "passive",
        target_amount: 50000,
      }),
    ).not.toThrow();
  });
});

describe("makeGoal defaults", () => {
  it("fills status/opening/is_archived and mints an id", () => {
    const g = makeGoal({
      ...base,
      kind: "spend_down",
      mode: "fixed",
      planned_monthly: 5000,
    });
    expect(g.status).toBe("active");
    expect(g.opening_contributed).toBe(0);
    expect(g.is_archived).toBe(false);
    expect(g.name).toBeNull();
    expect(g.id.length).toBeGreaterThan(0);
  });
  it("honors an explicit opening_contributed (absorbed leftover, §5.9.6)", () => {
    const g = makeGoal({
      ...base,
      kind: "spend_down",
      mode: "fixed",
      planned_monthly: 5000,
      opening_contributed: 12000,
    });
    expect(g.opening_contributed).toBe(12000);
  });
});
