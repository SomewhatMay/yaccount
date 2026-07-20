import { describe, it, expect } from "vitest";
import { applyOp, MemoryTx, newMemoryState, replay, type Op } from "@/core/oplog";
import { STORE, type StoreName } from "@/core/repo/db";
import { makeCategory, makeContainer, type Category, type Container } from "@/core/model";

const at = (ms: number): string => new Date(ms).toISOString();

function opCreateCategory(id: string, name: string, ts: number): Op {
  const row = makeCategory({ id, name, type: "expense" });
  return { id: `op-${id}`, ts: at(ts), type: "category.create", payload: { row } };
}

async function readAll<T>(
  state: ReturnType<typeof newMemoryState>,
  store: StoreName,
): Promise<T[]> {
  const tx = new MemoryTx(state);
  return tx.getAll<T>(store);
}

describe("applyOp — category ops", () => {
  it("category.create materializes the row", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, opCreateCategory("c1", "Groceries", 1000));
    const rows = await readAll<Category>(state, STORE.categories);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Groceries");
  });

  it("category.update replaces the full row (entity-level LWW)", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, opCreateCategory("c1", "Groceries", 1000));
    const renamed: Category = {
      ...makeCategory({ id: "c1", name: "Food", type: "expense" }),
    };
    await applyOp(tx, {
      id: "op-rename",
      ts: at(2000),
      type: "category.update",
      payload: { row: renamed },
    });
    const rows = await readAll<Category>(state, STORE.categories);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Food");
  });

  it("category.archive soft-deletes (never removes the row)", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    await applyOp(tx, opCreateCategory("c1", "Groceries", 1000));
    await applyOp(tx, {
      id: "op-arch",
      ts: at(2000),
      type: "category.archive",
      payload: { id: "c1" },
    });
    const rows = await readAll<Category>(state, STORE.categories);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_archived).toBe(true);
  });
});

describe("applyOp — container ops", () => {
  it("container.create + archive", async () => {
    const state = newMemoryState();
    const tx = new MemoryTx(state);
    const row = makeContainer({ id: "v1", name: "Vacation" });
    await applyOp(tx, {
      id: "o1",
      ts: at(1),
      type: "container.create",
      payload: { row },
    });
    await applyOp(tx, {
      id: "o2",
      ts: at(2),
      type: "container.archive",
      payload: { id: "v1" },
    });
    const rows = await readAll<Container>(state, STORE.containers);
    expect(rows[0].is_archived).toBe(true);
  });
});

describe("idempotency (§8.2) — replaying an op twice is a no-op", () => {
  it("applying the same op twice yields identical state", async () => {
    const once = newMemoryState();
    const twice = newMemoryState();
    const op = opCreateCategory("c1", "Groceries", 1000);
    const archive: Op = {
      id: "op-arch",
      ts: at(2000),
      type: "category.archive",
      payload: { id: "c1" },
    };

    const t1 = new MemoryTx(once);
    await applyOp(t1, op);
    await applyOp(t1, archive);

    const t2 = new MemoryTx(twice);
    await applyOp(t2, op);
    await applyOp(t2, op); // duplicate
    await applyOp(t2, archive);
    await applyOp(t2, archive); // duplicate

    expect(await readAll<Category>(twice, STORE.categories)).toEqual(
      await readAll<Category>(once, STORE.categories),
    );
  });
});

describe("replay — total order (ts, id) determinism (§8.2)", () => {
  it("replaying a shuffled op set converges to the same state as ordered application", async () => {
    const ops: Op[] = [
      opCreateCategory("c1", "Groceries", 1000),
      opCreateCategory("c2", "Rent", 1000), // same ts → id tiebreak
      {
        id: "op-c1-rename",
        ts: at(3000),
        type: "category.update",
        payload: { row: makeCategory({ id: "c1", name: "Food", type: "expense" }) },
      },
      { id: "op-c2-arch", ts: at(2000), type: "category.archive", payload: { id: "c2" } },
    ];

    const ordered = await replay(ops);
    const shuffled = await replay([ops[3], ops[1], ops[2], ops[0]]);

    const a = await new MemoryTx(ordered).getAll<Category>(STORE.categories);
    const b = await new MemoryTx(shuffled).getAll<Category>(STORE.categories);
    expect(b).toEqual(a);

    // and the applied end-state is correct
    const byId = Object.fromEntries(a.map((c) => [c.id, c]));
    expect(byId["c1"].name).toBe("Food");
    expect(byId["c2"].is_archived).toBe(true);
  });
});
