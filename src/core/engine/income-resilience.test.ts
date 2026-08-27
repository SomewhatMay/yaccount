import { describe, expect, it } from "vitest";
import {
  makeCategory,
  makeRecurringRule,
  makeTransaction,
  makeTransfer,
  type Transaction,
} from "@/core/model";
import { incomeResilience } from "./income-resilience";

const income = makeCategory({ id: "income", name: "Income", type: "income" });
const expense = makeCategory({ id: "expense", name: "Expense", type: "expense" });
const hiddenIncome = {
  ...makeCategory({ id: "hidden-income", name: "Hidden", type: "income" }),
  excluded_from_stats: true,
};
const categories = [income, expense, hiddenIncome];
const range = { start: "2026-02-23", end: "2026-08-23" };

function incomeRow(
  id: string,
  date: string,
  amount: number,
  source = "Northstar",
  categoryId = income.id,
): Transaction {
  return makeTransaction({
    id,
    date,
    amount,
    vendor_source: source,
    category_id: categoryId,
  });
}

describe("incomeResilience", () => {
  it("uses complete selected months, signed corrections, and the even median", () => {
    const result = incomeResilience({
      today: "2026-08-23",
      range,
      transactions: [
        incomeRow("feb", "2026-02-01", 100_000),
        incomeRow("mar", "2026-03-01", 200_000),
        incomeRow("apr", "2026-04-01", 300_000),
        incomeRow("may", "2026-05-01", 400_000),
        incomeRow("jun", "2026-06-01", 550_000),
        incomeRow("jun-correction", "2026-06-15", -50_000, " northstar "),
        incomeRow("jul", "2026-07-01", 600_000, "NORTHSTAR"),
        incomeRow("partial", "2026-08-01", 999_900),
        incomeRow("hidden", "2026-07-02", 999_900, "Hidden", hiddenIncome.id),
        makeTransfer({
          id: "transfer",
          date: "2026-07-03",
          amount: 50_000,
          container_id: "general",
          to_container_id: "savings",
          vendor_source: "Transfer",
        }),
      ],
      categories,
      recurringRules: [],
    });

    expect(result).toMatchObject({
      months: ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"],
      eligible: true,
      monthsNeeded: 0,
      typicalMonthly: 350_000,
      observedMin: 100_000,
      observedMax: 600_000,
      monthToMonthRange: 500_000,
      scheduledFixedMonthly: 0,
    });
    expect(result.monthly.map((month) => month.income)).toEqual([
      100_000, 200_000, 300_000, 400_000, 500_000, 600_000,
    ]);
    expect(result.sources).toEqual([
      expect.objectContaining({
        key: "northstar",
        label: "NORTHSTAR",
        total: 2_100_000,
        share: 1,
        classification: "variable",
      }),
    ]);
  });

  it("normalizes sources, preserves latest spelling, and holds the steady 5% boundary", () => {
    const months = ["02", "03", "04", "05", "06", "07"];
    const northstar = [9_500, 10_000, 10_500, 10_000, 9_500, 10_500];
    const studio = [100, 500, 100, 500, 100, 500];
    const transactions = months.flatMap((month, index) => [
      incomeRow(
        `north-${month}`,
        `2026-${month}-01`,
        northstar[index],
        index === 0 ? "  North   Star  " : index === 5 ? "NORTH STAR" : "north star",
      ),
      incomeRow(`studio-${month}`, `2026-${month}-02`, studio[index], "Studio work"),
      ...(index === 0 || index === 5
        ? [incomeRow(`bonus-${month}`, `2026-${month}-03`, 1_000, "Bonus")]
        : []),
    ]);

    const result = incomeResilience({
      today: "2026-08-23",
      range,
      transactions,
      categories,
      recurringRules: [],
    });

    expect(
      result.sources.map(({ label, classification }) => [label, classification]),
    ).toEqual([
      ["NORTH STAR", "steady"],
      ["Bonus", "occasional"],
      ["Studio work", "variable"],
    ]);
    expect(result.sources[0].monthly).toEqual(northstar);
    expect(result.largestSourceShare).toBeCloseTo(60_000 / 63_800);
  });

  it("directs progress before six complete months and withholds classifications", () => {
    const result = incomeResilience({
      today: "2026-08-23",
      range: { start: "2025-08-23", end: "2026-08-23" },
      transactions: [
        incomeRow("may", "2026-05-01", 100_000),
        incomeRow("june", "2026-06-01", 100_000),
        incomeRow("july", "2026-07-01", 100_000),
      ],
      categories,
      recurringRules: [],
    });

    expect(result).toMatchObject({
      months: ["2026-05", "2026-06", "2026-07"],
      eligible: false,
      monthsNeeded: 3,
      typicalMonthly: null,
      observedMin: null,
      observedMax: null,
      largestSourceShare: null,
      sources: [],
    });
  });

  it("normalizes fixed scheduled income over an exact next-12-month horizon", () => {
    const salary = makeRecurringRule({
      id: "salary",
      frequency: "monthly",
      interval_config: { day_of_month: 30 },
      template_vendor_source: "Salary",
      template_container_id: "general",
      template_category_id: income.id,
      template_amount: 460_000,
      start_date: "2026-01-01",
    });
    const annual = makeRecurringRule({
      id: "annual",
      frequency: "annually",
      interval_config: { month: 12, day: 1 },
      template_vendor_source: "Annual grant",
      template_container_id: "general",
      template_category_id: income.id,
      template_amount: 120_000,
      start_date: "2026-01-01",
    });
    const hidden = makeRecurringRule({
      id: "hidden",
      frequency: "monthly",
      interval_config: { day_of_month: 1 },
      template_vendor_source: "Hidden",
      template_container_id: "general",
      template_category_id: hiddenIncome.id,
      template_amount: 999_900,
      start_date: "2026-01-01",
    });
    const result = incomeResilience({
      today: "2026-08-23",
      range,
      transactions: [
        incomeRow("feb", "2026-02-01", 100),
        incomeRow("mar", "2026-03-01", 100),
        incomeRow("apr", "2026-04-01", 100),
        incomeRow("may", "2026-05-01", 100),
        incomeRow("jun", "2026-06-01", 100),
        incomeRow("jul", "2026-07-01", 100),
      ],
      categories,
      recurringRules: [salary, annual, hidden],
    });

    expect(result.scheduledFixedMonthly).toBe(470_000);
  });

  it("uses the middle observed month for an odd complete-month count", () => {
    const result = incomeResilience({
      today: "2026-08-23",
      range: { start: "2026-01-23", end: "2026-08-23" },
      transactions: ["01", "02", "03", "04", "05", "06", "07"].map((month, index) =>
        incomeRow(`income-${month}`, `2026-${month}-01`, (index + 1) * 100),
      ),
      categories,
      recurringRules: [],
    });

    expect(result.months).toHaveLength(7);
    expect(result.typicalMonthly).toBe(400);
  });

  it("classifies 5% as steady and anything above it as variable", () => {
    const months = ["02", "03", "04", "05", "06", "07"];
    const transactions = months.flatMap((month, index) => [
      incomeRow(
        `steady-${month}`,
        `2026-${month}-01`,
        index === 0 ? 9_500 : index === 5 ? 10_500 : 10_000,
        "Exact boundary",
      ),
      incomeRow(
        `over-${month}`,
        `2026-${month}-02`,
        index === 5 ? 10_501 : 10_000,
        "Over boundary",
      ),
    ]);
    const result = incomeResilience({
      today: "2026-08-23",
      range,
      transactions,
      categories,
      recurringRules: [],
    });

    expect(
      result.sources.find((source) => source.label === "Exact boundary")?.classification,
    ).toBe("steady");
    expect(
      result.sources.find((source) => source.label === "Over boundary")?.classification,
    ).toBe("variable");
  });
});
