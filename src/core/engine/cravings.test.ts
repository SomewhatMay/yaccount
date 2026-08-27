import { describe, expect, it } from "vitest";
import { makeCravingWin, makeTransfer, makeVoidRow } from "@/core/model";
import {
  cravingWinCumulativeSeries,
  cravingWinSummary,
  groupCravingWinsByYear,
  sortCravingWins,
} from "./cravings";

const win = (
  id: string,
  amount_kept: number,
  date: string,
  occurred_at = `${date}T12:00:00.000Z`,
) =>
  makeCravingWin({
    id,
    description: id,
    amount_kept,
    date,
    occurred_at,
  });

describe("Cravings Savings derivations", () => {
  it("sorts newest first without mutating its input", () => {
    const rows = [
      win("older", 100, "2025-12-31"),
      win("later", 300, "2026-08-26", "2026-08-26T18:00:00.000Z"),
      win("earlier", 200, "2026-08-26", "2026-08-26T12:00:00.000Z"),
    ];

    expect(sortCravingWins(rows).map((row) => row.id)).toEqual([
      "later",
      "earlier",
      "older",
    ]);
    expect(rows.map((row) => row.id)).toEqual(["older", "later", "earlier"]);
  });

  it("totals all wins, the current month, and only live linked transfers", () => {
    const moved = makeTransfer({
      id: "transfer-live",
      date: "2026-08-20",
      amount: 2400,
      container_id: "general",
      to_container_id: "trip-pot",
      fromName: "General",
      toName: "Trip",
    });
    const reversed = makeTransfer({
      id: "transfer-reversed",
      date: "2025-04-01",
      amount: 1000,
      container_id: "general",
      to_container_id: "trip-pot",
      fromName: "General",
      toName: "Trip",
    });
    const reversal = makeVoidRow(reversed, { id: "void-transfer" });
    const rows = [
      makeCravingWin({
        id: "takeout",
        description: "Takeout",
        amount_kept: 2400,
        date: "2026-08-20",
        occurred_at: "2026-08-20T18:00:00.000Z",
        goal_id: "trip",
        transfer_transaction_id: moved.id,
      }),
      makeCravingWin({
        id: "shoes",
        description: "Shoes",
        amount_kept: 5000,
        date: "2026-07-01",
        occurred_at: "2026-07-01T18:00:00.000Z",
      }),
      makeCravingWin({
        id: "coffee",
        description: "Coffee",
        amount_kept: 1000,
        date: "2025-04-01",
        occurred_at: "2025-04-01T18:00:00.000Z",
        goal_id: "trip",
        transfer_transaction_id: reversed.id,
      }),
    ];

    expect(cravingWinSummary(rows, [moved, reversed, reversal], "2026-08-26")).toEqual({
      totalKept: 8400,
      thisMonthKept: 2400,
      winCount: 3,
      movedToGoals: 2400,
    });
  });

  it("builds chronological cumulative history and newest-first yearly registers", () => {
    const rows = [
      win("aug", 300, "2026-08-01"),
      win("jan", 200, "2026-01-01"),
      win("old", 100, "2025-12-31"),
    ];

    expect(cravingWinCumulativeSeries(rows)).toEqual([100, 300, 600]);
    expect(groupCravingWinsByYear(rows)).toEqual([
      {
        year: "2026",
        totalKept: 500,
        winCount: 2,
        wins: [rows[0], rows[1]],
      },
      {
        year: "2025",
        totalKept: 100,
        winCount: 1,
        wins: [rows[2]],
      },
    ]);
  });
});
