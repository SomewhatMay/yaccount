import { describe, expect, it } from "vitest";
import {
  makeCategory,
  makeRecurringRule,
  type Frequency,
  type IntervalConfig,
  type RecurringRule,
} from "@/core/model";
import { commitmentMode, commitments } from "./commitments";

const housing = makeCategory({ id: "housing", name: "Housing", type: "expense" });
const utilities = makeCategory({
  id: "utilities",
  name: "Utilities",
  type: "expense",
});
const income = makeCategory({ id: "income", name: "Income", type: "income" });
const categories = [housing, utilities, income];

function rule(
  id: string,
  frequency: Frequency,
  interval_config: IntervalConfig,
  options: {
    amount?: number | null;
    amountMode?: "fixed" | "goal_derived";
    categoryId?: string | null;
    destinationId?: string | null;
    start?: string;
    end?: string | null;
    status?: "active" | "cancelled";
  } = {},
): RecurringRule {
  return makeRecurringRule({
    id,
    frequency,
    interval_config,
    template_vendor_source: id,
    template_container_id: "general",
    template_category_id:
      options.destinationId === undefined ? (options.categoryId ?? housing.id) : null,
    template_to_container_id: options.destinationId ?? null,
    template_amount: options.amount === undefined ? -1_000 : options.amount,
    amount_mode: options.amountMode,
    start_date: options.start ?? "2026-01-01",
    end_date: options.end,
    status: options.status,
  });
}

describe("commitmentMode", () => {
  it("puts monthly-or-faster rules in Regular and slower rules in Irregular", () => {
    const cases: [RecurringRule, "regular" | "irregular"][] = [
      [rule("daily", "daily", {}), "regular"],
      [rule("weekly", "weekly", { day_of_week: 1 }), "regular"],
      [rule("twice-monthly", "biweekly", { days_of_month: [1, 15] }), "regular"],
      [rule("monthly", "monthly", { day_of_month: 1 }), "regular"],
      [rule("annual", "annually", { month: 1, day: 1 }), "irregular"],
      [rule("30-days", "custom", { every: 30, unit: "day" }), "regular"],
      [rule("31-days", "custom", { every: 31, unit: "day" }), "irregular"],
      [rule("4-weeks", "custom", { every: 4, unit: "week" }), "regular"],
      [rule("5-weeks", "custom", { every: 5, unit: "week" }), "irregular"],
      [rule("1-month", "custom", { every: 1, unit: "month" }), "regular"],
      [rule("2-months", "custom", { every: 2, unit: "month" }), "irregular"],
      [rule("1-year", "custom", { every: 1, unit: "year" }), "irregular"],
    ];

    expect(cases.map(([item]) => commitmentMode(item))).toEqual(
      cases.map(([, expected]) => expected),
    );
  });
});

describe("commitments", () => {
  it("normalizes exact leap-year occurrences and reuses month-end clamping", () => {
    const result = commitments({
      today: "2027-03-01",
      categories,
      recurringRules: [
        rule("Daily", "daily", {}, { amount: -100 }),
        rule("Weekly", "weekly", { day_of_week: 0 }, { amount: -700 }),
        rule("Twice monthly", "biweekly", { days_of_month: [1, 15] }, { amount: -1_000 }),
        rule("Month end", "monthly", { day_of_month: 31 }, { amount: -3_100 }),
        rule("Annual", "annually", { month: 12, day: 31 }, { amount: -12_000 }),
      ],
    });

    expect(result).toMatchObject({
      start: "2027-03-01",
      end: "2028-02-29",
      activeExpenseRuleCount: 5,
      regular: {
        knownNext12Months: 134_200,
        monthlyEquivalent: 11_183,
        unknownAmountCount: 0,
      },
      irregular: {
        knownNext12Months: 12_000,
        monthlyEquivalent: 1_000,
        unknownAmountCount: 0,
      },
    });
    expect(
      result.regular.rules.map((item) => [item.label, item.occurrenceCount]),
    ).toEqual([
      ["Daily", 366],
      ["Twice monthly", 24],
      ["Weekly", 52],
      ["Month end", 12],
    ]);
    expect(
      result.regular.rules
        .find((item) => item.ruleId === "Month end")
        ?.occurrences.map((item) => item.date),
    ).toContain("2028-02-29");
  });

  it("honors lifecycle and keeps only expense rules without inventing null money", () => {
    const result = commitments({
      today: "2026-08-23",
      categories,
      recurringRules: [
        rule("future", "monthly", { day_of_month: 1 }, { start: "2026-09-01" }),
        rule("bounded", "monthly", { day_of_month: 15 }, { end: "2026-09-15" }),
        rule("ended", "monthly", { day_of_month: 1 }, { end: "2026-08-22" }),
        rule("cancelled", "monthly", { day_of_month: 1 }, { status: "cancelled" }),
        rule("salary", "monthly", { day_of_month: 1 }, { categoryId: income.id }),
        rule("transfer", "monthly", { day_of_month: 1 }, { destinationId: "save" }),
        rule(
          "later",
          "monthly",
          { day_of_month: 1 },
          {
            amount: null,
            amountMode: "goal_derived",
            categoryId: utilities.id,
          },
        ),
        rule("beyond", "monthly", { day_of_month: 1 }, { start: "2027-09-01" }),
      ],
    });

    expect(result.activeExpenseRuleCount).toBe(3);
    expect(result.regular.rules.map((item) => item.ruleId)).toEqual([
      "future",
      "bounded",
      "later",
    ]);
    expect(result.regular.knownNext12Months).toBe(13_000);
    expect(result.regular.monthlyEquivalent).toBe(1_083);
    expect(result.regular.unknownAmountCount).toBe(1);
    expect(result.regular.rules.find((item) => item.ruleId === "later")).toMatchObject({
      amount: null,
      monthlyEquivalent: null,
      occurrenceCount: 12,
    });
  });

  it("groups Regular load and dates Irregular occurrences deterministically", () => {
    const result = commitments({
      today: "2026-08-23",
      categories,
      recurringRules: [
        rule("Rent", "monthly", { day_of_month: 1 }, { amount: -160_000 }),
        rule(
          "Internet",
          "monthly",
          { day_of_month: 27 },
          { amount: -6_500, categoryId: utilities.id },
        ),
        rule(
          "Insurance",
          "annually",
          { month: 9, day: 3 },
          { amount: -84_000, categoryId: utilities.id },
        ),
        rule(
          "Dues",
          "custom",
          { every: 3, unit: "month" },
          { amount: -15_900, categoryId: utilities.id, start: "2026-01-15" },
        ),
      ],
    });

    expect(
      result.regular.groups.map((group) => [group.categoryName, group.monthlyEquivalent]),
    ).toEqual([
      ["Housing", 160_000],
      ["Utilities", 6_500],
    ]);
    expect(result.irregular.occurrences.map((item) => [item.date, item.label])).toEqual([
      ["2026-09-03", "Insurance"],
      ["2026-10-15", "Dues"],
      ["2027-01-15", "Dues"],
      ["2027-04-15", "Dues"],
      ["2027-07-15", "Dues"],
    ]);
    expect(result.irregular.knownNext12Months).toBe(147_600);
    expect(result.irregular.monthlyEquivalent).toBe(12_300);
    expect(result.irregular.months.reduce((sum, month) => sum + month.total, 0)).toBe(
      result.irregular.knownNext12Months,
    );
    expect(result.irregular.months).toHaveLength(13);
  });
});
