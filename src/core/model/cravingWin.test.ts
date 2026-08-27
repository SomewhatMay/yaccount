import { describe, expect, it } from "vitest";
import { CravingWinSchema, makeCravingWin } from "./cravingWin";

const base = {
  id: "win-1",
  description: "Takeout",
  amount_kept: 2400,
  date: "2026-08-26",
  occurred_at: "2026-08-26T23:15:00.000Z",
};

describe("CravingWin", () => {
  it("stores a positive estimate without pretending it is a ledger row", () => {
    expect(makeCravingWin(base)).toEqual({
      ...base,
      category_id: null,
      reflection: null,
      goal_id: null,
      transfer_transaction_id: null,
    });
  });

  it("trims human text and normalizes a blank reflection", () => {
    expect(
      makeCravingWin({
        ...base,
        description: "  New headphones  ",
        reflection: "  Mine still work.  ",
      }),
    ).toMatchObject({
      description: "New headphones",
      reflection: "Mine still work.",
    });
    expect(makeCravingWin({ ...base, reflection: "   " }).reflection).toBeNull();
  });

  it("requires a real positive amount, date, and occurrence instant", () => {
    expect(() => makeCravingWin({ ...base, amount_kept: 0 })).toThrow();
    expect(() => makeCravingWin({ ...base, amount_kept: -1 })).toThrow();
    expect(() => makeCravingWin({ ...base, amount_kept: 1.5 })).toThrow();
    expect(() => makeCravingWin({ ...base, date: "2026-02-30" })).toThrow();
    expect(() => makeCravingWin({ ...base, occurred_at: "2026-08-26" })).toThrow();
  });

  it("links a goal and its real transfer together or neither", () => {
    const linked = makeCravingWin({
      ...base,
      goal_id: "goal-1",
      transfer_transaction_id: "transfer-1",
    });
    expect(linked.goal_id).toBe("goal-1");
    expect(linked.transfer_transaction_id).toBe("transfer-1");

    expect(() =>
      CravingWinSchema.parse({ ...linked, transfer_transaction_id: null }),
    ).toThrow();
    expect(() => CravingWinSchema.parse({ ...linked, goal_id: null })).toThrow();
  });
});
