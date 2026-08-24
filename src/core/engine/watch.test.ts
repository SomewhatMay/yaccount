import { describe, expect, it } from "vitest";
import {
  makeBudgetTarget,
  makeCategory,
  makeContainer,
  makeGeneralContainer,
  makeRecurringRule,
  makeTransaction,
  makeTransfer,
  type Transaction,
} from "@/core/model";
import { categoryWatch, containerWatch } from "./watch";

const general = makeGeneralContainer();
const savings = makeContainer({ id: "savings", name: "Savings" });
const expense = makeCategory({ id: "expense", name: "Groceries", type: "expense" });
const income = makeCategory({ id: "income", name: "Income", type: "income" });

function row(
  id: string,
  date: string,
  amount: number,
  options: {
    containerId?: string;
    categoryId?: string;
    status?: "approved" | "pending";
  } = {},
): Transaction {
  return makeTransaction({
    id,
    date,
    amount,
    vendor_source: id,
    container_id: options.containerId ?? savings.id,
    category_id: options.categoryId === undefined ? expense.id : options.categoryId,
    inbox_status: options.status ?? "approved",
  });
}

describe("containerWatch", () => {
  it("uses raw subject cash, transfer direction, and an exact optional floor", () => {
    const bill = makeRecurringRule({
      id: "bill",
      frequency: "monthly",
      interval_config: { day_of_month: 27 },
      template_amount: -7_000,
      template_vendor_source: "Storage",
      template_category_id: expense.id,
      template_container_id: savings.id,
      start_date: "2026-01-01",
    });
    const transferIn = makeRecurringRule({
      id: "transfer-in",
      frequency: "monthly",
      interval_config: { day_of_month: 28 },
      template_amount: 5_000,
      template_vendor_source: "Savings transfer",
      template_category_id: null,
      template_container_id: general.id,
      template_to_container_id: savings.id,
      start_date: "2026-01-01",
    });
    const result = containerWatch({
      today: "2026-08-23",
      containerId: savings.id,
      floor: 48_000,
      transactions: [
        row("opening", "2026-07-01", 50_000, { categoryId: income.id }),
        makeTransfer({
          id: "transfer-in-actual",
          date: "2026-08-10",
          amount: 20_000,
          container_id: general.id,
          to_container_id: savings.id,
          vendor_source: "Move in",
        }),
        row("purchase", "2026-08-15", -5_000),
        makeTransfer({
          id: "future-out",
          date: "2026-08-25",
          amount: 10_000,
          container_id: savings.id,
          to_container_id: general.id,
          vendor_source: "Move out",
        }),
        row("other-container", "2026-08-20", -99_000, {
          containerId: general.id,
        }),
      ],
      categories: [expense, income],
      containers: [general, savings],
      recurringRules: [bill, transferIn],
    });

    expect(result).toMatchObject({
      containerId: savings.id,
      currentBalance: 65_000,
      netFlow30Days: 15_000,
      floor: 48_000,
      distanceAboveFloor: 0,
      floorBreached: false,
    });
    expect(result.forecast.startingBalance).toBe(65_000);
    expect(
      result.forecast.events.map(({ label, amount, balanceAfter }) => ({
        label,
        amount,
        balanceAfter,
      })),
    ).toEqual([
      { label: "Move out", amount: -10_000, balanceAfter: 55_000 },
      { label: "Storage", amount: -7_000, balanceAfter: 48_000 },
      { label: "Savings transfer", amount: 5_000, balanceAfter: 53_000 },
    ]);
    expect(result.forecast.low).toEqual({ balance: 48_000, date: "2026-08-27" });
  });

  it("never invents a floor", () => {
    const result = containerWatch({
      today: "2026-08-23",
      containerId: savings.id,
      floor: null,
      transactions: [row("opening", "2026-08-01", 10_000)],
      categories: [expense],
      containers: [savings],
      recurringRules: [],
    });

    expect(result.floor).toBeNull();
    expect(result.distanceAboveFloor).toBeNull();
    expect(result.floorBreached).toBeNull();
  });
});

describe("categoryWatch", () => {
  it("nets refunds, resolves monthly budgets, and projects from recent 7-day pace", () => {
    const months = ["03", "04", "05", "06", "07"];
    const historical = [51_000, 58_800, 64_200, 57_100, 67_000];
    const transactions = months.map((month, index) =>
      row(`spent-${month}`, `2026-${month}-15`, -historical[index]),
    );
    transactions.push(
      row("aug-earlier", "2026-08-01", -40_400),
      row("aug-recent", "2026-08-20", -14_600),
      row("aug-refund", "2026-08-21", 1_000),
      row("future", "2026-08-28", -10_000),
      row("pending", "2026-08-22", -20_000, { status: "pending" }),
    );
    const result = categoryWatch({
      today: "2026-08-23",
      categoryId: expense.id,
      transactions,
      budgetTargets: [
        makeBudgetTarget({
          id: "old-budget",
          category_id: expense.id,
          amount: 60_000,
          start_date: "2026-01-01",
        }),
        makeBudgetTarget({
          id: "new-budget",
          category_id: expense.id,
          amount: 62_500,
          start_date: "2026-07-01",
        }),
      ],
    });

    expect(result).toMatchObject({
      categoryId: expense.id,
      yearMonth: "2026-08",
      spent: 54_000,
      budget: 62_500,
      remaining: 8_500,
      recent7DaySpend: 13_600,
      likelyMonthEnd: 69_543,
      sixMonthMedian: 57_950,
    });
    expect(result.months).toEqual([
      { month: "2026-03", spent: 51_000, budget: 60_000, partial: false },
      { month: "2026-04", spent: 58_800, budget: 60_000, partial: false },
      { month: "2026-05", spent: 64_200, budget: 60_000, partial: false },
      { month: "2026-06", spent: 57_100, budget: 60_000, partial: false },
      { month: "2026-07", spent: 67_000, budget: 62_500, partial: false },
      { month: "2026-08", spent: 54_000, budget: 62_500, partial: true },
    ]);
  });
});
