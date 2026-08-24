import { describe, expect, it } from "vitest";
import {
  makeCategory,
  makeContainer,
  makeGeneralContainer,
  makeRecurringRule,
  makeTransaction,
  makeTransfer,
  type RecurringRule,
  type Transaction,
} from "@/core/model";
import { cashHorizon } from "./cash-horizon";

const general = makeGeneralContainer();
const savings = makeContainer({
  id: "savings",
  name: "Savings",
  include_in_overall_balance: true,
});
const outside = makeContainer({ id: "outside", name: "Outside" });
const investment = makeContainer({
  id: "investment",
  name: "Brokerage",
  is_investment: true,
  include_in_overall_balance: true,
});
const archived = {
  ...makeContainer({ id: "archived", name: "Old cash" }),
  is_archived: true,
};
const income = makeCategory({ id: "income", name: "Income", type: "income" });
const expense = makeCategory({ id: "expense", name: "Expense", type: "expense" });

function row(
  id: string,
  date: string,
  amount: number,
  options: {
    containerId?: string;
    categoryId?: string;
    status?: "approved" | "pending";
    ruleId?: string | null;
  } = {},
): Transaction {
  return makeTransaction({
    id,
    date,
    amount,
    vendor_source: id,
    category_id: options.categoryId ?? (amount >= 0 ? income.id : expense.id),
    container_id: options.containerId ?? general.id,
    inbox_status: options.status,
    recurring_rule_id: options.ruleId,
  });
}

function monthlyRule(
  id: string,
  day: number,
  amount: number | null,
  options: {
    containerId?: string;
    categoryId?: string;
    toContainerId?: string | null;
    status?: "active" | "cancelled";
  } = {},
): RecurringRule {
  return makeRecurringRule({
    id,
    frequency: "monthly",
    interval_config: { day_of_month: day },
    template_amount: amount,
    amount_mode: amount === null ? "goal_derived" : "fixed",
    template_vendor_source: id,
    template_category_id:
      options.toContainerId === undefined
        ? (options.categoryId ??
          (amount !== null && amount >= 0 ? income.id : expense.id))
        : null,
    template_container_id: options.containerId ?? general.id,
    template_to_container_id: options.toContainerId ?? null,
    start_date: "2026-01-01",
    status: options.status,
  });
}

const containers = [general, savings, outside, investment, archived];
const categories = [income, expense];

describe("cashHorizon", () => {
  it("starts as of today and applies known rows and rules once in deterministic order", () => {
    const internal = monthlyRule("internal", 26, 10_000, {
      toContainerId: savings.id,
    });
    const crossing = monthlyRule("crossing", 27, 5_000, {
      toContainerId: outside.id,
    });
    const rent = monthlyRule("Rent", 28, -60_000);
    const salary = monthlyRule("Salary", 30, 80_000);
    const result = cashHorizon(
      [row("opening", "2026-08-01", 100_000), row("Card", "2026-08-25", -20_000)],
      categories,
      containers,
      [salary, rent, crossing, internal],
      "2026-08-23",
      14,
    );

    expect(result).toMatchObject({
      start: "2026-08-23",
      end: "2026-09-06",
      startingBalance: 100_000,
      projectedBalance: 95_000,
      low: { balance: 15_000, date: "2026-08-28" },
      firstBelowZero: null,
      largestShortfall: 0,
      billsBeforeNextIncome: { count: 2, amount: -80_000 },
    });
    expect(result.containerIds).toEqual([general.id, savings.id]);
    expect(
      result.events.map(({ date, label, amount, balanceAfter }) => ({
        date,
        label,
        amount,
        balanceAfter,
      })),
    ).toEqual([
      { date: "2026-08-25", label: "Card", amount: -20_000, balanceAfter: 80_000 },
      { date: "2026-08-26", label: "internal", amount: 0, balanceAfter: 80_000 },
      { date: "2026-08-27", label: "crossing", amount: -5_000, balanceAfter: 75_000 },
      { date: "2026-08-28", label: "Rent", amount: -60_000, balanceAfter: 15_000 },
      { date: "2026-08-30", label: "Salary", amount: 80_000, balanceAfter: 95_000 },
    ]);
    expect(result.nextIncome).toMatchObject({ label: "Salary", date: "2026-08-30" });
  });

  it("keeps future approved rows out of starting cash and enters them on their dates", () => {
    const result = cashHorizon(
      [row("opening", "2026-08-01", 50_000), row("future", "2026-08-24", -7_500)],
      categories,
      [general],
      [],
      "2026-08-23",
      14,
    );

    expect(result.startingBalance).toBe(50_000);
    expect(result.events).toEqual([
      expect.objectContaining({
        id: "future",
        source: "approved-future",
        amount: -7_500,
        balanceAfter: 42_500,
      }),
    ]);
    expect(result.projectedBalance).toBe(42_500);
  });

  it.each(["pending", "approved"] as const)(
    "lets a linked %s row replace its rule occurrence exactly once",
    (status) => {
      const bill = monthlyRule("bill", 25, -10_000);
      const linked = row("linked", "2026-08-25", -12_000, {
        status,
        ruleId: bill.id,
      });
      const result = cashHorizon(
        [row("opening", "2026-08-01", 50_000), linked],
        categories,
        [general],
        [bill],
        "2026-08-23",
        14,
      );

      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({
        id: linked.id,
        amount: -12_000,
        source: status === "pending" ? "pending" : "approved-future",
      });
    },
  );

  it("reports the first below-zero day and largest known shortfall", () => {
    const result = cashHorizon(
      [row("opening", "2026-08-01", 30_000)],
      categories,
      [general],
      [monthlyRule("Power", 25, -50_000), monthlyRule("Pay", 30, 10_000)],
      "2026-08-23",
      14,
    );

    expect(result.low).toEqual({ balance: -20_000, date: "2026-08-25" });
    expect(result.firstBelowZero).toEqual({ balance: -20_000, date: "2026-08-25" });
    expect(result.largestShortfall).toBe(20_000);
  });

  it("does not call refunds income and handles no-income and unknown-amount rules", () => {
    const refund = row("Refund", "2026-08-24", 5_000, {
      categoryId: expense.id,
    });
    const unknown = monthlyRule("Goal amount set later", 26, null, {
      categoryId: expense.id,
    });
    const result = cashHorizon(
      [row("opening", "2026-08-01", 10_000), refund],
      categories,
      [general],
      [unknown],
      "2026-08-23",
      14,
    );

    expect(result.nextIncome).toBeNull();
    expect(result.events[0]).toMatchObject({ kind: "expense", amount: 5_000 });
    expect(result.unknownEvents).toEqual([
      {
        ruleId: unknown.id,
        date: "2026-08-26",
        label: "Goal amount set later",
      },
    ]);
  });

  it("excludes archived, opted-out, and investment containers from cash", () => {
    const result = cashHorizon(
      [
        row("cash", "2026-08-01", 10_000),
        row("outside", "2026-08-01", 20_000, { containerId: outside.id }),
        row("investment", "2026-08-01", 30_000, {
          containerId: investment.id,
        }),
        row("archived", "2026-08-01", 40_000, { containerId: archived.id }),
      ],
      categories,
      containers,
      [
        monthlyRule("outside bill", 25, -5_000, { containerId: outside.id }),
        monthlyRule("cancelled", 25, -5_000, { status: "cancelled" }),
      ],
      "2026-08-23",
      14,
    );

    expect(result.startingBalance).toBe(10_000);
    expect(result.events).toEqual([]);
  });

  it("does not mutate or materialize inputs while reading the forecast", () => {
    const transactions = [row("opening", "2026-08-01", 10_000)];
    const rules = [monthlyRule("bill", 25, -1_000)];
    const before = structuredClone({ transactions, rules });

    cashHorizon(transactions, categories, [general], rules, "2026-08-23", 14);

    expect({ transactions, rules }).toEqual(before);
  });
});
