import { describe, it, expect } from "vitest";
import {
  createCategory,
  updateCategory,
  archiveCategory,
  createTransaction,
  updateTransaction,
  voidTransaction,
} from "@/core/commands";
import { makeCategory, makeTransaction } from "@/core/model";

const META = { id: "op1", ts: "2026-07-20T00:00:00.000Z" };

describe("category commands", () => {
  it("createCategory builds a category.create op carrying a full row", () => {
    const op = createCategory({ name: "Groceries", type: "expense" }, META);
    expect(op.type).toBe("category.create");
    expect(op.id).toBe("op1");
    expect(op.ts).toBe(META.ts);
    if (op.type !== "category.create") throw new Error("narrow");
    expect(op.payload.row.name).toBe("Groceries");
    expect(op.payload.row.is_archived).toBe(false);
  });

  it("updateCategory carries the edited row (entity-LWW)", () => {
    const row = makeCategory({ id: "c1", name: "Food", type: "expense" });
    const op = updateCategory(row, META);
    expect(op.type).toBe("category.update");
    if (op.type !== "category.update") throw new Error("narrow");
    expect(op.payload.row.id).toBe("c1");
  });

  it("archiveCategory carries just the id (soft delete, §5.5)", () => {
    const op = archiveCategory("c1", META);
    expect(op.type).toBe("category.archive");
    if (op.type !== "category.archive") throw new Error("narrow");
    expect(op.payload.id).toBe("c1");
  });

  it("mints its own op id/ts when meta is omitted", () => {
    const a = createCategory({ name: "A", type: "expense" });
    const b = createCategory({ name: "B", type: "expense" });
    expect(a.id).not.toBe(b.id);
    expect(a.ts.length).toBeGreaterThan(0);
  });
});

describe("transaction commands", () => {
  it("createTransaction builds a transaction.create op with derived yearMonth", () => {
    const op = createTransaction(
      { date: "2026-07-20", amount: -1000, vendor_source: "Starbucks", category_id: "coffee" },
      META,
    );
    expect(op.type).toBe("transaction.create");
    if (op.type !== "transaction.create") throw new Error("narrow");
    expect(op.payload.row.yearMonth).toBe("2026-07");
    expect(op.payload.row.amount).toBe(-1000);
  });

  it("updateTransaction carries the edited row", () => {
    const row = makeTransaction({
      id: "t1",
      date: "2026-07-20",
      amount: -1200,
      vendor_source: "Starbucks",
      category_id: "coffee",
    });
    const op = updateTransaction(row, META);
    expect(op.type).toBe("transaction.update");
    if (op.type !== "transaction.update") throw new Error("narrow");
    expect(op.payload.row.amount).toBe(-1200);
  });

  it("voidTransaction builds a reversing row linked to the original (§0.3)", () => {
    const orig = makeTransaction({
      id: "t1",
      date: "2026-07-20",
      amount: -1000,
      vendor_source: "Starbucks",
      category_id: "coffee",
    });
    const op = voidTransaction(orig, { ...META, voidId: "v1" });
    expect(op.type).toBe("transaction.void");
    if (op.type !== "transaction.void") throw new Error("narrow");
    expect(op.payload.row.id).toBe("v1");
    expect(op.payload.row.amount).toBe(1000);
    expect(op.payload.row.reverses_id).toBe("t1");
  });
});
