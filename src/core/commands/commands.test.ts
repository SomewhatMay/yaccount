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
  createTemplate,
  removeTemplate,
  logTemplate,
  createRecurringRule,
  updateRecurringRule,
  cancelRecurringRule,
  uncancelRecurringRule,
  approveTransaction,
  createGoal,
  updateGoal,
  completeGoal,
  cancelGoal,
  uncancelGoal,
  archiveGoal,
  unarchiveGoal,
} from "@/core/commands";
import {
  makeBudgetTarget,
  makeCategory,
  makeContainer,
  makeContainerSnapshot,
  makeTemplate,
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

describe("entered_at is stamped from the op timestamp (M11)", () => {
  // The op already carries the authoritative instant. Reusing it keeps the row and
  // the journal in agreement and keeps commands deterministic under injected meta.
  it("createTransaction / createTransfer / createTemplate stamp the op ts", () => {
    const create = createTransaction(
      {
        date: "2026-07-20",
        amount: -1000,
        vendor_source: "Starbucks",
        category_id: "coffee",
      },
      META,
    );
    if (create.type !== "transaction.create") throw new Error("narrow");
    expect(create.payload.row.entered_at).toBe(META.ts);

    const transfer = createTransfer(
      {
        date: "2026-07-20",
        amount: 10000,
        container_id: "general",
        to_container_id: "vacation",
        fromName: "General",
        toName: "Vacation",
      },
      META,
    );
    if (transfer.type !== "transaction.create") throw new Error("narrow");
    expect(transfer.payload.row.entered_at).toBe(META.ts);

    const template = createTemplate(
      {
        template_name: "Tims",
        amount: -400,
        vendor_source: "Tims",
        container_id: "general",
        category_id: "coffee",
      },
      META,
    );
    if (template.type !== "template.create") throw new Error("narrow");
    expect(template.payload.row.entered_at).toBe(META.ts);
  });

  it("a caller-chosen instant wins over the op ts — the user can set the time", () => {
    // The op ts is only a DEFAULT ("recorded now"). Once the entry time is an
    // editable field, what the user picked has to survive to the row.
    const chosen = "2026-07-15T17:41:00.000Z";
    const create = createTransaction(
      {
        date: "2026-07-15",
        amount: -1000,
        vendor_source: "Starbucks",
        category_id: "coffee",
        entered_at: chosen,
      },
      META,
    );
    if (create.type !== "transaction.create") throw new Error("narrow");
    expect(create.payload.row.entered_at).toBe(chosen);

    const transfer = createTransfer(
      {
        date: "2026-07-15",
        amount: 10000,
        container_id: "general",
        to_container_id: "vacation",
        fromName: "General",
        toName: "Vacation",
        entered_at: chosen,
      },
      META,
    );
    if (transfer.type !== "transaction.create") throw new Error("narrow");
    expect(transfer.payload.row.entered_at).toBe(chosen);
  });

  it("a void stamps its OWN op ts, not the original's instant", () => {
    const orig = makeTransaction({
      id: "t1",
      date: "2026-07-20",
      amount: -1000,
      vendor_source: "Starbucks",
      category_id: "coffee",
      entered_at: "2026-07-14T09:00:00.000Z",
    });
    const later = { id: "op2", ts: "2026-07-22T18:30:00.000Z" };
    const op = voidTransaction(orig, { ...later, voidId: "v1" });
    if (op.type !== "transaction.void") throw new Error("narrow");
    expect(op.payload.row.entered_at).toBe(later.ts);
  });

  it("quick-logging a template dates the new row now, not at the template's instant", () => {
    const template = makeTemplate({
      id: "tmpl9",
      template_name: "Tims",
      amount: -400,
      vendor_source: "Tims",
      container_id: "general",
      category_id: "coffee",
      entered_at: "2026-01-01T00:00:00.000Z",
    });
    const op = logTemplate(template, { date: "2026-07-20", id: "new1" }, META);
    if (op.type !== "transaction.create") throw new Error("narrow");
    expect(op.payload.row.entered_at).toBe(META.ts);
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

describe("template & recurring commands (M6, §5.8)", () => {
  const template = makeTemplate({
    id: "tmpl1",
    template_name: "Blue Bottle",
    amount: -650,
    vendor_source: "Blue Bottle",
    category_id: "coffee",
    container_id: "general",
  });

  it("createTemplate builds a template.create op with an is_template row", () => {
    const op = createTemplate(
      {
        template_name: "Blue Bottle",
        amount: -650,
        vendor_source: "Blue Bottle",
        category_id: "coffee",
        container_id: "general",
      },
      META,
    );
    expect(op.type).toBe("template.create");
    if (op.type !== "template.create") throw new Error("narrow");
    expect(op.payload.row.is_template).toBe(true);
    expect(op.payload.row.template_name).toBe("Blue Bottle");
  });

  it("removeTemplate builds a template.remove op", () => {
    expect(removeTemplate("tmpl1", META).type).toBe("template.remove");
  });

  it("logTemplate turns a template into a real dated ledger row", () => {
    const op = logTemplate(template, { date: "2026-07-21", id: "t9" }, META);
    expect(op.type).toBe("transaction.create");
    if (op.type !== "transaction.create") throw new Error("narrow");
    expect(op.payload.row.is_template).toBe(false);
    expect(op.payload.row.date).toBe("2026-07-21");
    expect(op.payload.row.amount).toBe(-650);
    expect(op.payload.row.category_id).toBe("coffee");
  });

  it("logTemplate on a transfer template logs a transfer", () => {
    const transferTemplate = makeTemplate({
      id: "tmpl2",
      template_name: "to savings",
      amount: 20000,
      vendor_source: "to savings",
      container_id: "general",
      to_container_id: "savings",
    });
    const op = logTemplate(transferTemplate, { date: "2026-07-21" }, META);
    expect(op.type).toBe("transaction.create");
    if (op.type !== "transaction.create") throw new Error("narrow");
    expect(op.payload.row.to_container_id).toBe("savings");
    expect(op.payload.row.amount).toBe(-20000); // transfer stored negative on source
  });

  it("createRecurringRule builds a rule with a computed cursor and active status", () => {
    const op = createRecurringRule(
      {
        frequency: "monthly",
        interval_config: { day_of_month: 1 },
        template_vendor_source: "Netflix",
        template_container_id: "general",
        template_category_id: "sub",
        template_amount: -1500,
        start_date: "2026-01-01",
        id: "r1",
      },
      META,
    );
    expect(op.type).toBe("recurringRule.create");
    if (op.type !== "recurringRule.create") throw new Error("narrow");
    expect(op.payload.row.status).toBe("active");
    expect(op.payload.row.next_generation_date).toBe("2026-01-01");
  });

  it("cancel/uncancel/update/approve build the right op types", () => {
    expect(cancelRecurringRule("r1", META).type).toBe("recurringRule.cancel");
    expect(uncancelRecurringRule("r1", META).type).toBe("recurringRule.uncancel");
    expect(approveTransaction("p1", META).type).toBe("transaction.approve");
    const rule = createRecurringRule(
      {
        frequency: "daily",
        interval_config: {},
        template_vendor_source: "Coffee",
        template_container_id: "general",
        template_category_id: "coffee",
        template_amount: -300,
        start_date: "2026-01-01",
        id: "r2",
      },
      META,
    );
    if (rule.type !== "recurringRule.create") throw new Error("narrow");
    expect(updateRecurringRule(rule.payload.row, META).type).toBe("recurringRule.update");
  });
});

describe("goal commands (§5.9, M7)", () => {
  it("createGoal builds a goal.create op with a validated row", () => {
    const op = createGoal(
      {
        container_id: "clothing",
        kind: "spend_down",
        mode: "deadline",
        target_amount: 20000,
        deadline: "2026-11-30",
        created_date: "2026-01-01",
        id: "g1",
      },
      META,
    );
    expect(op.type).toBe("goal.create");
    if (op.type !== "goal.create") throw new Error("narrow");
    expect(op.payload.row.status).toBe("active");
    expect(op.payload.row.target_amount).toBe(20000);
  });

  it("completeGoal carries the id + completed date", () => {
    const op = completeGoal("g1", "2026-06-15", META);
    expect(op.type).toBe("goal.complete");
    if (op.type !== "goal.complete") throw new Error("narrow");
    expect(op.payload).toEqual({ id: "g1", date: "2026-06-15" });
  });

  it("cancel/uncancel/archive/unarchive build the right op types", () => {
    expect(cancelGoal("g1", META).type).toBe("goal.cancel");
    expect(uncancelGoal("g1", META).type).toBe("goal.uncancel");
    expect(archiveGoal("g1", META).type).toBe("goal.archive");
    expect(unarchiveGoal("g1", META).type).toBe("goal.unarchive");
  });

  it("updateGoal passes the whole edited row (entity-LWW)", () => {
    const created = createGoal({
      container_id: "clothing",
      kind: "spend_down",
      mode: "fixed",
      planned_monthly: 5000,
      created_date: "2026-01-01",
      id: "g2",
    });
    if (created.type !== "goal.create") throw new Error("narrow");
    const op = updateGoal({ ...created.payload.row, name: "Renamed" }, META);
    expect(op.type).toBe("goal.update");
    if (op.type !== "goal.update") throw new Error("narrow");
    expect(op.payload.row.name).toBe("Renamed");
  });
});
