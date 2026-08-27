import { describe, it, expect } from "vitest";
import { makeGoal, makeTransaction, makeTransfer, type Transaction } from "@/core/model";
import {
  goalContributed,
  goalBasis,
  goalProgress,
  goalRemainingProgress,
  requiredMonthly,
  requiresReplan,
  isAchieved,
  projectedCompletion,
  wholeMonthsUntil,
} from "@/core/engine";

const CLOTHING = "clothing";
const GENERAL = "general";

/** A transfer of `magnitude` cents from general into the goal container on `date`. */
function contribute(magnitude: number, date: string, id: string): Transaction {
  return makeTransfer({
    id,
    date,
    amount: magnitude,
    container_id: GENERAL,
    to_container_id: CLOTHING,
    fromName: "General",
    toName: "Clothing",
  });
}
/** An expense OUT of the goal container (spending on its purpose). */
function spend(magnitude: number, date: string, id: string): Transaction {
  return makeTransaction({
    id,
    date,
    amount: -magnitude,
    vendor_source: "Store",
    category_id: "cat-clothing",
    container_id: CLOTHING,
  });
}

describe("wholeMonthsUntil (§5.9.4 — current month inclusive)", () => {
  it("counts the current month through the deadline month inclusively", () => {
    expect(wholeMonthsUntil("2026-07-20", "2026-11-30")).toBe(5); // Jul..Nov
    expect(wholeMonthsUntil("2026-07-01", "2026-07-31")).toBe(1); // same month
    expect(wholeMonthsUntil("2026-12-01", "2027-02-01")).toBe(3); // across year
  });
  it("is ≤ 0 at or after the deadline month", () => {
    expect(wholeMonthsUntil("2026-11-15", "2026-10-01")).toBeLessThanOrEqual(0);
  });
});

describe("spend_down goal — progress is contributions, never balance (§5.9.3)", () => {
  const goal = makeGoal({
    container_id: CLOTHING,
    kind: "spend_down",
    mode: "deadline",
    target_amount: 20000,
    deadline: "2026-11-30",
    created_date: "2026-01-01",
  });

  it("fully funded then spent on purpose stays 100%, ask stays $0 (canonical clothing)", () => {
    const txns = [
      contribute(20000, "2026-03-01", "c1"), // $200 in by spring
      spend(2000, "2026-07-10", "e1"), // −$20 shirt in July
    ];
    expect(goalContributed(goal, txns)).toBe(20000); // the shirt never touched it
    expect(goalProgress(goal, txns)).toBe(1);
    expect(requiredMonthly(goal, txns, "2026-08-01")).toBe(0);
    expect(goalRemainingProgress(goal, txns)).toBe(0.9);
  });

  it("accepts exact compact balance/contribution facts with array parity", () => {
    const txns = [
      contribute(20000, "2026-03-01", "c1"),
      spend(2000, "2026-07-10", "e1"),
    ];
    const facts = { balance: 18000, netContribution: 20000 };

    expect(goalContributed(goal, facts)).toBe(goalContributed(goal, txns));
    expect(goalBasis(goal, facts)).toBe(goalBasis(goal, txns));
    expect(goalProgress(goal, facts)).toBe(goalProgress(goal, txns));
    expect(goalRemainingProgress(goal, facts)).toBe(goalRemainingProgress(goal, txns));
    expect(requiredMonthly(goal, facts, "2026-08-01")).toBe(
      requiredMonthly(goal, txns, "2026-08-01"),
    );
  });

  it("half-saved then a spend: remaining = target − contributed (schedule untouched)", () => {
    const txns = [contribute(10000, "2026-06-01", "c1"), spend(2000, "2026-07-10", "e1")];
    expect(goalContributed(goal, txns)).toBe(10000);
    // remaining is target − contributed, not target − balance
    const remaining = (goal.target_amount ?? 0) - goalContributed(goal, txns);
    expect(remaining).toBe(10000);
  });

  it("opening_contributed (absorbed leftover) counts toward contributed", () => {
    const g = makeGoal({
      container_id: CLOTHING,
      kind: "spend_down",
      mode: "fixed",
      planned_monthly: 5000,
      opening_contributed: 8000,
      created_date: "2026-01-01",
    });
    expect(goalContributed(g, [contribute(2000, "2026-02-01", "c1")])).toBe(10000);
  });

  it("has no remaining fraction before funding", () => {
    expect(goalRemainingProgress(goal, [])).toBeNull();
  });

  it("excludes pending transfers — approval is what moves money (§10 #3)", () => {
    const pending = makeTransfer({
      id: "p1",
      date: "2026-02-01",
      amount: 5000,
      container_id: GENERAL,
      to_container_id: CLOTHING,
      fromName: "General",
      toName: "Clothing",
      inbox_status: "pending",
    });
    expect(goalContributed(goal, [pending])).toBe(0);
  });

  it("ignores transfers dated before the cycle start (§5.9.3 windowing)", () => {
    expect(goalContributed(goal, [contribute(5000, "2025-12-31", "old")])).toBe(0);
  });
});

describe("deadline mode — the date is sacred, the ask flexes (§5.9.4)", () => {
  const goal = makeGoal({
    container_id: CLOTHING,
    kind: "spend_down",
    mode: "deadline",
    target_amount: 20000,
    deadline: "2026-11-30",
    created_date: "2026-01-01",
  });

  it("spreads the remaining over the whole months left (current month inclusive)", () => {
    // nothing saved yet; Jul → 5 months (Jul..Nov). 20000/5 = 4000
    expect(requiredMonthly(goal, [], "2026-07-01")).toBe(4000);
  });

  it("missing a month raises next month's ask (built-in catch-up)", () => {
    const before = requiredMonthly(goal, [], "2026-07-01"); // /5 = 4000
    const after = requiredMonthly(goal, [], "2026-09-01"); // /3 = 6667 (ceil)
    expect(after).toBeGreaterThan(before);
    expect(after).toBe(Math.ceil(20000 / 3));
  });

  it("overshooting drops the ask to $0 early (done early)", () => {
    const txns = [contribute(20000, "2026-02-01", "c1")];
    expect(requiredMonthly(goal, txns, "2026-05-01")).toBe(0);
  });

  it("at/after the deadline and still short: ask = full remaining, replan flagged (no ÷0)", () => {
    const txns = [contribute(5000, "2026-02-01", "c1")];
    expect(requiredMonthly(goal, txns, "2026-12-01")).toBe(15000);
    expect(requiresReplan(goal, txns, "2026-12-01")).toBe(true);
    expect(requiresReplan(goal, txns, "2026-07-01")).toBe(false);
  });
});

describe("fixed mode — the ask is sacred, the date flexes (§5.9.4)", () => {
  const goal = makeGoal({
    container_id: CLOTHING,
    kind: "spend_down",
    mode: "fixed",
    target_amount: 20000,
    planned_monthly: 5000,
    created_date: "2026-01-01",
  });

  it("asks the committed M until the target is reached", () => {
    expect(requiredMonthly(goal, [], "2026-07-01")).toBe(5000);
    const done = [contribute(20000, "2026-02-01", "c1")];
    expect(requiredMonthly(goal, done, "2026-07-01")).toBe(0);
  });

  it("open-ended fixed (no target) always asks M and has no projected date/progress", () => {
    const open = makeGoal({
      container_id: CLOTHING,
      kind: "spend_down",
      mode: "fixed",
      planned_monthly: 5000,
      created_date: "2026-01-01",
    });
    expect(
      requiredMonthly(open, [contribute(99999, "2026-02-01", "c1")], "2026-07-01"),
    ).toBe(5000);
    expect(goalProgress(open, [])).toBeNull();
    expect(projectedCompletion(open, [], "2026-07-01")).toBeNull();
  });

  it("projects a completion date at rate M (advisory)", () => {
    // contributed 5000, remaining 15000 at 5000/mo → 3 more months → Oct 2026
    const txns = [contribute(5000, "2026-06-01", "c1")];
    expect(projectedCompletion(goal, txns, "2026-07-15")).toBe("2026-10-15");
  });
});

describe("passive mode — tracked, claims nothing (§5.9.4)", () => {
  it("never asks and shows a progress bar only if a target is set", () => {
    const withTarget = makeGoal({
      container_id: CLOTHING,
      kind: "spend_down",
      mode: "passive",
      target_amount: 20000,
      created_date: "2026-01-01",
    });
    expect(
      requiredMonthly(withTarget, [contribute(5000, "2026-02-01", "c")], "2026-07-01"),
    ).toBe(0);
    expect(goalProgress(withTarget, [contribute(5000, "2026-02-01", "c")])).toBeCloseTo(
      0.25,
    );

    const loose = makeGoal({
      container_id: CLOTHING,
      kind: "spend_down",
      mode: "passive",
      created_date: "2026-01-01",
    });
    expect(goalProgress(loose, [])).toBeNull();
  });
});

describe("reserve goal — progress is balance; a withdrawal re-opens the ask (§5.9.3)", () => {
  const goal = makeGoal({
    container_id: CLOTHING,
    kind: "reserve",
    mode: "deadline",
    target_amount: 1000000, // $10k
    deadline: "2027-01-31",
    created_date: "2026-01-01",
  });

  it("full then a crisis withdrawal drops progress and re-claims the shortfall", () => {
    const filled = [contribute(1000000, "2026-02-01", "c1")];
    expect(goalBasis(goal, filled)).toBe(1000000);
    expect(goalProgress(goal, filled)).toBe(1);
    // −$3,000 crisis EXPENSE out of the reserve container
    const afterCrisis = [...filled, spend(300000, "2026-06-10", "e1")];
    expect(goalBasis(goal, afterCrisis)).toBe(700000); // basis = live balance
    expect(goalProgress(goal, afterCrisis)).toBe(0.7);
    // the plan re-claims the shortfall over the months left (deadline basis=balance)
    expect(requiredMonthly(goal, afterCrisis, "2026-07-01")).toBe(Math.ceil(300000 / 7));
    expect(goalRemainingProgress(goal, afterCrisis)).toBeNull();
  });

  it("reserve never latches to achieved (it oscillates, §5.9.6)", () => {
    const filled = [contribute(1000000, "2026-02-01", "c1")];
    expect(isAchieved(goal, filled)).toBe(false);
  });

  it("reserve + fixed refills at M until balance ≥ target", () => {
    const g = makeGoal({
      container_id: CLOTHING,
      kind: "reserve",
      mode: "fixed",
      target_amount: 1000000,
      planned_monthly: 50000,
      created_date: "2026-01-01",
    });
    expect(requiredMonthly(g, [], "2026-07-01")).toBe(50000);
    expect(
      requiredMonthly(g, [contribute(1000000, "2026-02-01", "c1")], "2026-07-01"),
    ).toBe(0);
  });
});

describe("isAchieved (§5.9.6 — spend_down completes and closes)", () => {
  const goal = makeGoal({
    container_id: CLOTHING,
    kind: "spend_down",
    mode: "deadline",
    target_amount: 20000,
    deadline: "2026-11-30",
    created_date: "2026-01-01",
  });
  it("true once contributed ≥ target, even over 100%", () => {
    expect(isAchieved(goal, [contribute(20000, "2026-02-01", "c1")])).toBe(true);
    expect(isAchieved(goal, [contribute(22000, "2026-02-01", "c1")])).toBe(true); // >100% ok
    expect(isAchieved(goal, [contribute(19000, "2026-02-01", "c1")])).toBe(false);
  });
});
