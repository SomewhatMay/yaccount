import { describe, it, expect } from "vitest";
import {
  CategorySchema,
  ContainerSchema,
  BudgetTargetSchema,
  TransactionSchema,
  ContainerSnapshotSchema,
  RecurringRuleSchema,
  GoalSchema,
  makeCategory,
  makeContainer,
  GENERAL_CONTAINER_ID,
  makeGeneralContainer,
} from "@/core/model";
import { yearMonthOf, newId } from "@/core/model/primitives";

describe("primitives", () => {
  it("newId returns distinct non-empty ids", () => {
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
  it("yearMonthOf extracts YYYY-MM from an ISO calendar date", () => {
    expect(yearMonthOf("2026-07-20")).toBe("2026-07");
    expect(yearMonthOf("1999-12-31")).toBe("1999-12");
  });
  it("yearMonthOf rejects malformed dates", () => {
    expect(() => yearMonthOf("2026-7-1")).toThrow();
    expect(() => yearMonthOf("nope")).toThrow();
  });
});

describe("CategorySchema (§5.1)", () => {
  it("accepts a valid expense category", () => {
    const c = CategorySchema.parse({
      id: "c1",
      name: "Groceries",
      type: "expense",
      is_archived: false,
      color: null,
    });
    expect(c.type).toBe("expense");
  });
  it("rejects an unknown type", () => {
    expect(() =>
      CategorySchema.parse({
        id: "c1",
        name: "X",
        type: "savings",
        is_archived: false,
        color: null,
      }),
    ).toThrow();
  });
  it("rejects an empty name", () => {
    expect(() =>
      CategorySchema.parse({
        id: "c1",
        name: "",
        type: "income",
        is_archived: false,
        color: null,
      }),
    ).toThrow();
  });
  it("makeCategory fills defaults (color null, not archived) and validates", () => {
    const c = makeCategory({ name: "Salary", type: "income" });
    expect(c.color).toBeNull();
    expect(c.is_archived).toBe(false);
    expect(c.id.length).toBeGreaterThan(0);
  });
});

describe("ContainerSchema (§5.2)", () => {
  it("accepts a valid container", () => {
    const c = ContainerSchema.parse({
      id: "x",
      name: "Vacation",
      is_investment: false,
      include_in_overall_balance: false,
      is_archived: false,
    });
    expect(c.include_in_overall_balance).toBe(false);
  });
  it("makeContainer defaults include_in_overall_balance to false (opt-in, §5.7)", () => {
    const c = makeContainer({ name: "Clothing" });
    expect(c.include_in_overall_balance).toBe(false);
    expect(c.is_investment).toBe(false);
    expect(c.is_archived).toBe(false);
  });
  it("the seeded 'general' wallet is opted into overall balance (§5.2/§5.7)", () => {
    const g = makeGeneralContainer();
    expect(g.id).toBe(GENERAL_CONTAINER_ID);
    expect(g.include_in_overall_balance).toBe(true);
  });
});

describe("BudgetTargetSchema (§5.3)", () => {
  it("accepts a nonnegative integer-cents amount", () => {
    const b = BudgetTargetSchema.parse({
      id: "b1",
      category_id: "c1",
      amount: 30000,
      start_date: "2026-01-01",
    });
    expect(b.amount).toBe(30000);
  });
  it("rejects a negative amount and non-integer cents", () => {
    expect(() =>
      BudgetTargetSchema.parse({
        id: "b1",
        category_id: "c1",
        amount: -1,
        start_date: "2026-01-01",
      }),
    ).toThrow();
    expect(() =>
      BudgetTargetSchema.parse({
        id: "b1",
        category_id: "c1",
        amount: 12.5,
        start_date: "2026-01-01",
      }),
    ).toThrow();
  });
});

describe("TransactionSchema (§5.4)", () => {
  const base = {
    id: "t1",
    date: "2026-07-20",
    amount: -1000,
    vendor_source: "Starbucks",
    category_id: "c1",
    container_id: "general",
    to_container_id: null,
    is_template: false,
    template_name: null,
    inbox_status: "approved" as const,
    recurring_rule_id: null,
    notes: null,
    reverses_id: null,
    yearMonth: "2026-07",
  };
  it("accepts an expense (negative amount, category set, no destination)", () => {
    expect(TransactionSchema.parse(base).amount).toBe(-1000);
  });
  it("permits either sign on any category — sign ⟂ type is a UI default only (§5.4/§10.13)", () => {
    // a +$100 credit row against an expense category (a refund) must be valid
    expect(TransactionSchema.parse({ ...base, amount: 10000 }).amount).toBe(10000);
  });
  it("permits a transfer shape (null category, destination set)", () => {
    const t = TransactionSchema.parse({
      ...base,
      category_id: null,
      to_container_id: "vacation",
      vendor_source: "General → Vacation",
    });
    expect(t.category_id).toBeNull();
    expect(t.to_container_id).toBe("vacation");
  });
  it("requires an integer amount and a non-empty vendor_source", () => {
    expect(() => TransactionSchema.parse({ ...base, amount: 10.5 })).toThrow();
    expect(() => TransactionSchema.parse({ ...base, vendor_source: "" })).toThrow();
  });
  it("rejects an unknown inbox_status", () => {
    expect(() => TransactionSchema.parse({ ...base, inbox_status: "draft" })).toThrow();
  });
});

describe("ContainerSnapshotSchema (§5.6)", () => {
  it("accepts a reported balance in integer cents", () => {
    const s = ContainerSnapshotSchema.parse({
      id: "s1",
      container_id: "inv",
      date: "2026-07-01",
      reported_balance: 5000000,
    });
    expect(s.reported_balance).toBe(5000000);
  });
});

describe("RecurringRuleSchema (§5.8)", () => {
  it("accepts a fixed monthly expense rule", () => {
    const r = RecurringRuleSchema.parse({
      id: "r1",
      frequency: "monthly",
      interval_config: { day_of_month: 1 },
      template_amount: -1500,
      template_vendor_source: "Netflix",
      template_category_id: "c1",
      template_container_id: "general",
      template_to_container_id: null,
      amount_mode: "fixed",
      linked_goal_id: null,
      start_date: "2026-01-01",
      end_date: null,
      next_generation_date: "2026-08-01",
    });
    expect(r.frequency).toBe("monthly");
    expect(r.amount_mode).toBe("fixed");
  });
  it("rejects an unknown frequency / amount_mode", () => {
    const good = {
      id: "r1",
      frequency: "monthly",
      interval_config: { day_of_month: 1 },
      template_amount: -1500,
      template_vendor_source: "Netflix",
      template_category_id: "c1",
      template_container_id: "general",
      template_to_container_id: null,
      amount_mode: "fixed",
      linked_goal_id: null,
      start_date: "2026-01-01",
      end_date: null,
      next_generation_date: "2026-08-01",
    };
    expect(() => RecurringRuleSchema.parse({ ...good, frequency: "hourly" })).toThrow();
    expect(() => RecurringRuleSchema.parse({ ...good, amount_mode: "weird" })).toThrow();
  });
});

describe("GoalSchema (§5.9.2)", () => {
  it("accepts a spend_down deadline goal", () => {
    const g = GoalSchema.parse({
      id: "g1",
      container_id: "clothing",
      name: "Winter clothes",
      kind: "spend_down",
      mode: "deadline",
      target_amount: 20000,
      deadline: "2026-11-30",
      planned_monthly: null,
      opening_contributed: 0,
      status: "active",
      is_archived: false,
      created_date: "2026-01-01",
      completed_date: null,
    });
    expect(g.kind).toBe("spend_down");
  });
  it("rejects unknown kind/mode/status and a negative target", () => {
    const good = {
      id: "g1",
      container_id: "clothing",
      name: null,
      kind: "spend_down",
      mode: "fixed",
      target_amount: 20000,
      deadline: null,
      planned_monthly: 5000,
      opening_contributed: 0,
      status: "active",
      is_archived: false,
      created_date: "2026-01-01",
      completed_date: null,
    };
    expect(() => GoalSchema.parse({ ...good, kind: "hoard" })).toThrow();
    expect(() => GoalSchema.parse({ ...good, mode: "someday" })).toThrow();
    expect(() => GoalSchema.parse({ ...good, status: "paused" })).toThrow();
    expect(() => GoalSchema.parse({ ...good, target_amount: -1 })).toThrow();
  });
});
