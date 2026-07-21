import { describe, it, expect } from "vitest";
import {
  createCategory,
  updateCategory,
  archiveCategory,
  createTransaction,
  updateTransaction,
  voidTransaction,
  createContainer,
  updateContainer,
  archiveContainer,
  createTransfer,
  recordSnapshot,
  updateSnapshot,
  removeSnapshot,
  setBudgetTarget,
  removeBudgetTarget,
  setDefaultContainer,
  unarchiveCategory,
  unarchiveContainer,
  unvoidTransaction,
} from "@/core/commands";
import {
  makeBudgetTarget,
  makeCategory,
  makeContainer,
  makeContainerSnapshot,
  makeTransaction,
  SETTING,
} from "@/core/model";

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
      {
        date: "2026-07-20",
        amount: -1000,
        vendor_source: "Starbucks",
        category_id: "coffee",
      },
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

describe("container commands (§5.2, §5.5)", () => {
  it("createContainer defaults to excluded from overall balance (opt-in, §5.7)", () => {
    const op = createContainer({ name: "Vacation" }, META);
    expect(op.type).toBe("container.create");
    if (op.type !== "container.create") throw new Error("narrow");
    expect(op.payload.row.name).toBe("Vacation");
    expect(op.payload.row.include_in_overall_balance).toBe(false);
    expect(op.payload.row.is_investment).toBe(false);
    expect(op.payload.row.is_archived).toBe(false);
  });

  it("createContainer carries the investment + opt-in flags when set", () => {
    const op = createContainer(
      { name: "Brokerage", is_investment: true, include_in_overall_balance: true },
      META,
    );
    if (op.type !== "container.create") throw new Error("narrow");
    expect(op.payload.row.is_investment).toBe(true);
    expect(op.payload.row.include_in_overall_balance).toBe(true);
  });

  it("updateContainer carries the edited row (entity-LWW)", () => {
    const row = makeContainer({ id: "k1", name: "Vacation" });
    const op = updateContainer({ ...row, name: "Trip" }, META);
    expect(op.type).toBe("container.update");
    if (op.type !== "container.update") throw new Error("narrow");
    expect(op.payload.row.name).toBe("Trip");
  });

  it("archiveContainer carries just the id (soft delete, §5.5)", () => {
    const op = archiveContainer("k1", META);
    expect(op.type).toBe("container.archive");
    if (op.type !== "container.archive") throw new Error("narrow");
    expect(op.payload.id).toBe("k1");
  });
});

describe("createTransfer (§5.4)", () => {
  const input = {
    date: "2026-07-20",
    amount: 30000,
    container_id: "general",
    to_container_id: "vacation",
    fromName: "General",
    toName: "Vacation",
  };

  it("builds a transaction.create op holding one negative, category-less row", () => {
    const op = createTransfer(input, META);
    expect(op.type).toBe("transaction.create");
    if (op.type !== "transaction.create") throw new Error("narrow");
    expect(op.payload.row.amount).toBe(-30000);
    expect(op.payload.row.category_id).toBeNull();
    expect(op.payload.row.to_container_id).toBe("vacation");
    expect(op.payload.row.vendor_source).toBe("General → Vacation");
  });
});

describe("snapshot + settings commands", () => {
  it("recordSnapshot builds a snapshot.record op (§5.6)", () => {
    const op = recordSnapshot(
      {
        id: "s1",
        container_id: "brokerage",
        date: "2026-07-20",
        reported_balance: 500000,
      },
      META,
    );
    expect(op.type).toBe("snapshot.record");
    if (op.type !== "snapshot.record") throw new Error("narrow");
    expect(op.payload.row.reported_balance).toBe(500000);
    expect(op.payload.row.container_id).toBe("brokerage");
  });

  it("setDefaultContainer builds a setting.set op keyed by the setting name", () => {
    const op = setDefaultContainer("vacation", META);
    expect(op.type).toBe("setting.set");
    if (op.type !== "setting.set") throw new Error("narrow");
    expect(op.payload.row).toEqual({
      key: SETTING.defaultContainerId,
      value: "vacation",
    });
  });
});

describe("snapshot corrections", () => {
  it("updateSnapshot carries the corrected row", () => {
    const row = makeContainerSnapshot({
      id: "s1",
      container_id: "brokerage",
      date: "2026-07-20",
      reported_balance: 500000,
    });
    const op = updateSnapshot(row, META);
    expect(op.type).toBe("snapshot.update");
    if (op.type !== "snapshot.update") throw new Error("narrow");
    expect(op.payload.row.reported_balance).toBe(500000);
  });

  it("removeSnapshot carries just the id — the removal is itself journaled", () => {
    const op = removeSnapshot("s1", META);
    expect(op.type).toBe("snapshot.remove");
    if (op.type !== "snapshot.remove") throw new Error("narrow");
    expect(op.payload.id).toBe("s1");
  });
});

describe("budget target commands (§5.3, M4)", () => {
  it("setBudgetTarget builds a budgetTarget.set op carrying a full row", () => {
    const op = setBudgetTarget(
      { category_id: "groceries", amount: 30000, start_date: "2026-01-01" },
      META,
    );
    expect(op.type).toBe("budgetTarget.set");
    if (op.type !== "budgetTarget.set") throw new Error("narrow");
    expect(op.payload.row.category_id).toBe("groceries");
    expect(op.payload.row.amount).toBe(30000);
    expect(op.payload.row.start_date).toBe("2026-01-01");
  });

  it("setBudgetTarget can carry an explicit id (for editing an existing row)", () => {
    const row = makeBudgetTarget({
      id: "bt1",
      category_id: "groceries",
      amount: 35000,
      start_date: "2026-01-01",
    });
    const op = setBudgetTarget(row, META);
    if (op.type !== "budgetTarget.set") throw new Error("narrow");
    expect(op.payload.row.id).toBe("bt1");
  });

  it("removeBudgetTarget carries just the id — the removal is itself journaled", () => {
    const op = removeBudgetTarget("bt1", META);
    expect(op.type).toBe("budgetTarget.remove");
    if (op.type !== "budgetTarget.remove") throw new Error("narrow");
    expect(op.payload.id).toBe("bt1");
  });
});

describe("undo commands (§0.3 — every soft delete is reversible)", () => {
  it("unarchiveCategory / unarchiveContainer carry just the id", () => {
    expect(unarchiveCategory("c1", META).type).toBe("category.unarchive");
    expect(unarchiveContainer("k1", META).type).toBe("container.unarchive");
  });

  it("unvoidTransaction reverses the reversing row, restoring the original", () => {
    const orig = makeTransaction({
      id: "t1",
      date: "2026-07-20",
      amount: -1000,
      vendor_source: "Starbucks",
      category_id: "coffee",
    });
    const voidOp = voidTransaction(orig, { ...META, voidId: "v1" });
    if (voidOp.type !== "transaction.void") throw new Error("narrow");
    const undo = unvoidTransaction(voidOp.payload.row, { ...META, voidId: "u1" });
    if (undo.type !== "transaction.void") throw new Error("narrow");
    expect(undo.payload.row.id).toBe("u1");
    expect(undo.payload.row.reverses_id).toBe("v1"); // reverses the reversal
    expect(undo.payload.row.amount).toBe(-1000); // nets the void back out
  });
});
