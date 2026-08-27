import { describe, expect, it } from "vitest";
import { makeCravingWin, type CravingWin } from "@/core/model";
import { createCravingWin, removeCravingWin, updateCravingWin } from "@/core/commands";
import { applyOp, MemoryTx, newMemoryState, replay } from "@/core/oplog";
import { STORE } from "@/core/repo/db";

const row = makeCravingWin({
  id: "win-1",
  description: "Takeout",
  amount_kept: 2400,
  date: "2026-08-26",
  occurred_at: "2026-08-26T23:15:00.000Z",
});

describe("CravingWin replay", () => {
  it("creates, updates, and removes the materialized row", async () => {
    const tx = new MemoryTx(newMemoryState());
    await applyOp(tx, createCravingWin(row));
    expect(await tx.get<CravingWin>(STORE.cravingWins, row.id)).toEqual(row);

    const updated = { ...row, reflection: "Dinner is at home." };
    await applyOp(tx, updateCravingWin(updated));
    expect(await tx.get<CravingWin>(STORE.cravingWins, row.id)).toEqual(updated);

    await applyOp(tx, removeCravingWin(row.id));
    expect(await tx.get<CravingWin>(STORE.cravingWins, row.id)).toBeUndefined();
  });

  it("converges under canonical replay and repeated ops", async () => {
    const create = createCravingWin(row, {
      id: "op-create",
      ts: "2026-08-26T23:15:00.000Z",
    });
    const update = updateCravingWin(
      { ...row, amount_kept: 3000 },
      {
        id: "op-update",
        ts: "2026-08-26T23:16:00.000Z",
      },
    );
    const state = await replay([update, create, update]);

    expect(await new MemoryTx(state).get<CravingWin>(STORE.cravingWins, row.id)).toEqual({
      ...row,
      amount_kept: 3000,
    });
  });
});
