import { describe, expect, it } from "vitest";
import { createCravingWin, removeCravingWin, updateCravingWin } from "@/core/commands";
import { makeCravingWin } from "@/core/model";

const row = makeCravingWin({
  id: "win-1",
  description: "Takeout",
  amount_kept: 2400,
  date: "2026-08-26",
  occurred_at: "2026-08-26T23:15:00.000Z",
});

describe("CravingWin commands", () => {
  it("builds create, update, and remove journal ops", () => {
    const created = createCravingWin(row, {
      id: "op-create",
      ts: "2026-08-26T23:16:00.000Z",
    });
    expect(created).toEqual({
      id: "op-create",
      ts: "2026-08-26T23:16:00.000Z",
      type: "cravingWin.create",
      payload: { row },
    });

    expect(
      updateCravingWin(
        { ...row, reflection: "Dinner is at home." },
        {
          id: "op-update",
          ts: "2026-08-26T23:17:00.000Z",
        },
      ),
    ).toMatchObject({ type: "cravingWin.update", payload: { row: { id: "win-1" } } });

    expect(
      removeCravingWin(row.id, {
        id: "op-remove",
        ts: "2026-08-26T23:18:00.000Z",
      }),
    ).toEqual({
      id: "op-remove",
      ts: "2026-08-26T23:18:00.000Z",
      type: "cravingWin.remove",
      payload: { id: "win-1" },
    });
  });
});
