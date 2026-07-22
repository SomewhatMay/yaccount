import { describe, it, expect } from "vitest";
import {
  RecurringRuleSchema,
  makeRecurringRule,
  isTransferRule,
  type IntervalConfig,
} from "@/core/model";

const base = {
  frequency: "monthly" as const,
  interval_config: { day_of_month: 1 } as IntervalConfig,
  template_vendor_source: "Netflix",
  template_container_id: "general",
  template_category_id: "c1",
  template_amount: -1500,
  start_date: "2026-01-01",
};

describe("RecurringRuleSchema — interval_config discriminated by frequency (§5.8)", () => {
  it("accepts each frequency with its matching config", () => {
    const configs: [Parameters<typeof makeRecurringRule>[0]["frequency"], IntervalConfig][] = [
      ["daily", {}],
      ["weekly", { day_of_week: 3 }],
      ["biweekly", { days_of_month: [1, 15] }],
      ["monthly", { day_of_month: 28 }],
      ["annually", { month: 6, day: 15 }],
      ["custom", { every: 2, unit: "week" }],
    ];
    for (const [frequency, interval_config] of configs) {
      expect(() => makeRecurringRule({ ...base, frequency, interval_config })).not.toThrow();
    }
  });

  it("rejects a config that doesn't match the frequency", () => {
    // weekly needs day_of_week, not day_of_month.
    expect(() =>
      makeRecurringRule({ ...base, frequency: "weekly", interval_config: { day_of_month: 1 } as IntervalConfig }),
    ).toThrow();
    // day_of_week out of range.
    expect(() =>
      makeRecurringRule({ ...base, frequency: "weekly", interval_config: { day_of_week: 9 } as IntervalConfig }),
    ).toThrow();
    // custom needs a positive `every`.
    expect(() =>
      makeRecurringRule({ ...base, frequency: "custom", interval_config: { every: 0, unit: "day" } as IntervalConfig }),
    ).toThrow();
  });

  it("biweekly requires two ascending anchor days", () => {
    expect(() =>
      makeRecurringRule({ ...base, frequency: "biweekly", interval_config: { days_of_month: [15, 1] } as IntervalConfig }),
    ).toThrow();
  });

  it("rejects an unknown frequency", () => {
    expect(() =>
      RecurringRuleSchema.parse({
        ...base,
        id: "r1",
        frequency: "hourly",
        amount_mode: "fixed",
        template_to_container_id: null,
        linked_goal_id: null,
        end_date: null,
        next_generation_date: "2026-01-01",
      }),
    ).toThrow();
  });
});

describe("RecurringRuleSchema — cross-field rules (§5.8)", () => {
  it("a fixed rule needs template_amount", () => {
    expect(() =>
      makeRecurringRule({ ...base, amount_mode: "fixed", template_amount: null }),
    ).toThrow();
  });

  it("a goal_derived rule may omit template_amount (recomputed at generation, §5.9.5)", () => {
    expect(() =>
      makeRecurringRule({ ...base, amount_mode: "goal_derived", template_amount: null }),
    ).not.toThrow();
  });

  it("a rule must be an expense/income (category) or a transfer (destination)", () => {
    expect(() =>
      makeRecurringRule({
        ...base,
        template_category_id: null,
        template_to_container_id: null,
      }),
    ).toThrow();
  });
});

describe("makeRecurringRule — defaults (§5.8)", () => {
  it("defaults next_generation_date to start_date and status to active", () => {
    const r = makeRecurringRule({ ...base, id: "r1" });
    expect(r.next_generation_date).toBe("2026-01-01");
    expect(r.status).toBe("active");
    expect(r.amount_mode).toBe("fixed");
  });

  it("isTransferRule detects the transfer shape", () => {
    const entry = makeRecurringRule({ ...base, id: "r1" });
    const transfer = makeRecurringRule({
      ...base,
      id: "r2",
      template_category_id: null,
      template_to_container_id: "savings",
    });
    expect(isTransferRule(entry)).toBe(false);
    expect(isTransferRule(transfer)).toBe(true);
  });
});
