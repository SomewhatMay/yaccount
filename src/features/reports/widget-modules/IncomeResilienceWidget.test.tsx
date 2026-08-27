import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  makeCategory,
  makeGeneralContainer,
  makeRecurringRule,
  makeTransaction,
  type Transaction,
} from "@/core/model";
import { createDashboardAggregates } from "../dashboard-aggregates";
import { DASHBOARD_WIDGETS, type WidgetContext } from "../registry";
import {
  IncomeResilienceCompact,
  IncomeResilienceExpanded,
} from "./IncomeResilienceWidget";

const general = makeGeneralContainer();
const income = makeCategory({ id: "income", name: "Income", type: "income" });
const expense = makeCategory({ id: "expense", name: "Expense", type: "expense" });
const categories = [income, expense];
const totals = [462_000, 548_000, 550_000, 690_000, 500_000, 548_000];
const months = ["02", "03", "04", "05", "06", "07"];
const transactions = months.flatMap((month, index) => [
  makeTransaction({
    id: `north-${month}`,
    date: `2026-${month}-01`,
    amount: 400_000,
    vendor_source: "Northstar salary",
    category_id: income.id,
  }),
  makeTransaction({
    id: `studio-${month}`,
    date: `2026-${month}-02`,
    amount: totals[index] - 400_000,
    vendor_source: "Studio work",
    category_id: income.id,
  }),
]);
const salary = makeRecurringRule({
  id: "salary",
  frequency: "monthly",
  interval_config: { day_of_month: 30 },
  template_vendor_source: "Scheduled salary",
  template_container_id: general.id,
  template_category_id: income.id,
  template_amount: 470_000,
  start_date: "2026-01-01",
});

function context(rows: Transaction[] = transactions): WidgetContext {
  const recurringRules = [salary];
  return {
    range: { start: "2026-02-23", end: "2026-08-23" },
    today: "2026-08-23",
    cravingWins: [],
    categories,
    containers: [general],
    ledgerTransactions: rows,
    reportTransactions: rows,
    budgetTargets: [],
    snapshots: [],
    recurringRules,
    goals: [],
    aggregates: createDashboardAggregates({
      budgetTargets: [],
      categories,
      containers: [general],
      ledgerTransactions: rows,
      reportTransactions: rows,
      recurringRules,
      snapshots: [],
      goals: [],
    }),
  };
}

it("renders observed variability and source concentration with compact parity", () => {
  const expanded = renderToStaticMarkup(<IncomeResilienceExpanded {...context()} />);
  const compact = renderToStaticMarkup(<IncomeResilienceCompact {...context()} />);

  expect(expanded).toContain("last 6 complete months");
  expect(expanded).toContain('aria-label="Typical month: $5,480.00"');
  expect(expanded).toContain(
    'aria-label="Observed income range: $4,620.00 to $6,900.00; typical $5,480.00"',
  );
  expect(expanded).toContain("Northstar salary");
  expect(expanded).toContain("73%");
  expect(expanded).toContain("steady");
  expect(expanded).toContain("Studio work");
  expect(expanded).toContain("variable");
  expect(expanded).toContain('aria-label="Scheduled fixed income: $4,700.00 per month"');
  expect(expanded).toContain('aria-label="Largest-source share: 73%"');
  expect(expanded).toContain('aria-label="Month-to-month range: $2,280.00"');
  expect(expanded).toContain("appeared within 5% in all 6 months");
  expect(compact).toContain('aria-label="Typical month: $5,480.00"');
  expect(compact).toContain("$4,620.00 – $6,900.00");
  expect(compact).toContain("Largest source");
  expect(compact).toContain("Fixed scheduled");
  expect(compact).toContain("No score; inspect sources.");
});

it("directs progress before six complete months", () => {
  const short = transactions.filter((row) => row.date >= "2026-05-01");
  const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === "resilience")!;

  expect(definition.availability?.(context(short))).toEqual({
    status: "insufficient-data",
    title: "Build six complete income months",
    description:
      "3 of 6 complete months observed; the current partial month is excluded.",
    action: { label: "Review income history", href: "/ledger" },
  });
});

it("discloses monthly observations, source rule, and scheduled context", () => {
  const disclosure = DASHBOARD_WIDGETS.find((widget) => widget.id === "resilience")!
    .math!(context());

  expect(disclosure.range).toBe("February–July 2026 · 6 complete months");
  expect(disclosure.lines).toEqual(
    expect.arrayContaining([
      { kind: "actual", label: "February 2026 income", amount: 462_000 },
      { kind: "actual", label: "July 2026 income", amount: 548_000 },
      { kind: "context", label: "Typical month (median)", amount: 548_000 },
      {
        kind: "context",
        label: "Observed month-to-month range",
        amount: 228_000,
      },
      {
        kind: "scheduled",
        label: "Fixed scheduled income, monthly equivalent",
        amount: 470_000,
      },
    ]),
  );
  expect(disclosure.exclusions).toContain("the current partial month");
  expect(disclosure.exclusions).toContain("stats-hidden categories");
  expect(disclosure.rule).toContain("whitespace-collapsed, case-folded source");
  expect(disclosure.rule).toContain("within 5% of its median in every month");
});
