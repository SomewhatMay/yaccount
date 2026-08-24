import { describe, expect, it } from "vitest";
import {
  makeCategory,
  makeTransaction,
  makeTransfer,
  type Category,
  type Transaction,
} from "@/core/model";
import { statsTransactions } from "./reporting";
import { whatChanged } from "./what-changed";

const salary = makeCategory({ id: "salary", name: "Salary", type: "income" });
const travel = makeCategory({ id: "travel", name: "Travel", type: "expense" });
const dining = makeCategory({ id: "dining", name: "Dining out", type: "expense" });
const home = makeCategory({ id: "home", name: "Home", type: "expense" });
const groceries = makeCategory({
  id: "groceries",
  name: "Groceries",
  type: "expense",
});
const hidden: Category = {
  ...makeCategory({ id: "hidden", name: "Hidden", type: "expense" }),
  excluded_from_stats: true,
};
const categories = [salary, travel, dining, home, groceries, hidden];

function row(
  id: string,
  date: string,
  amount: number,
  categoryId: string,
  source: string,
): Transaction {
  return makeTransaction({
    id,
    date,
    amount,
    category_id: categoryId,
    vendor_source: source,
    entered_at: `${date}T12:00:00.000Z`,
  });
}

const transactions = [
  row("salary-before", "2026-07-22", 500_000, salary.id, " ACME   Payroll "),
  row("travel-before", "2026-07-12", -60_000, travel.id, "Airline"),
  row("dining-before", "2026-07-13", -30_000, dining.id, "Cafe"),
  row("home-before", "2026-07-14", -10_000, home.id, "Hardware"),
  row("grocery-before", "2026-07-15", -20_000, groceries.id, "Market"),
  row("hidden-before", "2026-07-16", -90_000, hidden.id, "Hidden"),
  row("salary-now", "2026-08-20", 470_000, salary.id, "acme payroll"),
  row("travel-now", "2026-08-05", -25_000, travel.id, "Airline"),
  row("travel-refund", "2026-08-06", 10_000, travel.id, "Airline"),
  row("dining-now", "2026-08-08", -11_800, dining.id, "Cafe"),
  row("home-now", "2026-08-09", -22_600, home.id, "Hardware"),
  row("grocery-now", "2026-08-10", -8_000, groceries.id, "Market"),
  row("hidden-now", "2026-08-11", -10_000, hidden.id, "Hidden"),
  makeTransfer({
    id: "transfer-before",
    date: "2026-07-17",
    amount: 900_000,
    vendor_source: "General → Savings",
    container_id: "general",
    to_container_id: "savings",
  }),
  makeTransfer({
    id: "transfer-now",
    date: "2026-08-15",
    amount: 100,
    vendor_source: "Savings → General",
    container_id: "savings",
    to_container_id: "general",
  }),
  makeTransaction({
    id: "pending",
    date: "2026-08-12",
    amount: -999_999,
    category_id: travel.id,
    vendor_source: "Pending trip",
    inbox_status: "pending",
  }),
];

describe("whatChanged", () => {
  it.each([
    [
      { start: "2024-02-01", end: "2024-02-29" },
      { start: "2024-01-03", end: "2024-01-31" },
    ],
    [
      { start: "2025-01-01", end: "2025-01-31" },
      { start: "2024-12-01", end: "2024-12-31" },
    ],
    [
      { start: "2026-03-01", end: "2026-03-31" },
      { start: "2026-01-29", end: "2026-02-28" },
    ],
  ])("uses the immediately preceding equal-length range %#", (range, preceding) => {
    expect(whatChanged([], categories, range)?.previousRange).toEqual(preceding);
  });

  it("reconciles income sources, expense categories, refunds, and Everything else", () => {
    const result = whatChanged(statsTransactions(transactions, categories), categories, {
      start: "2026-08-01",
      end: "2026-08-23",
    })!;

    expect(result.current).toEqual({
      income: 470_000,
      expense: 57_400,
      kept: 412_600,
    });
    expect(result.previous).toEqual({
      income: 500_000,
      expense: 120_000,
      kept: 380_000,
    });
    expect(result.changeInKept).toBe(32_600);
    expect(
      result.drivers.map(({ kind, label, contribution }) => [kind, label, contribution]),
    ).toEqual([
      ["expense", "Travel", 45_000],
      ["income", "acme payroll", -30_000],
      ["expense", "Dining out", 18_200],
      ["expense", "Home", -12_600],
    ]);
    expect(result.everythingElse).toBe(12_000);
    expect(
      result.drivers.reduce((sum, driver) => sum + driver.contribution, 0) +
        result.everythingElse,
    ).toBe(result.changeInKept);
  });

  it("normalizes income sources deterministically and only marks possible timing", () => {
    const result = whatChanged(transactions, categories, {
      start: "2026-08-01",
      end: "2026-08-23",
    })!;
    const reversed = whatChanged([...transactions].reverse(), categories, {
      start: "2026-08-01",
      end: "2026-08-23",
    });
    const income = result.drivers.find((driver) => driver.kind === "income")!;

    expect(reversed).toEqual(result);
    expect(income).toMatchObject({
      key: "acme payroll",
      label: "acme payroll",
      currentLedgerAmount: 470_000,
      previousLedgerAmount: 500_000,
      contribution: -30_000,
      likelyTiming: true,
    });
  });

  it("excludes transfers, pending rows, and statistically hidden categories", () => {
    const result = whatChanged(statsTransactions(transactions, categories), categories, {
      start: "2026-08-01",
      end: "2026-08-23",
    })!;

    expect(result.allDrivers.map((driver) => driver.key)).not.toContain(hidden.id);
    expect(result.current.kept).toBe(412_600);
  });

  it("returns no comparison for an unbounded or inverted period", () => {
    expect(whatChanged(transactions, categories, { start: null, end: null })).toBeNull();
    expect(
      whatChanged(transactions, categories, {
        start: "2026-08-23",
        end: "2026-08-01",
      }),
    ).toBeNull();
  });
});
