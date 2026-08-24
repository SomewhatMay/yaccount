import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { makeCategory, makeGeneralContainer, makeTransaction } from "@/core/model";
import { statsTransactions } from "@/core/engine";
import { createDashboardAggregates } from "../dashboard-aggregates";
import { DASHBOARD_WIDGETS, type WidgetContext } from "../registry";
import { WhatChangedCompact, WhatChangedExpanded } from "./WhatChangedWidget";

const income = makeCategory({ id: "income", name: "Income", type: "income" });
const travel = makeCategory({ id: "travel", name: "Travel", type: "expense" });
const groceries = makeCategory({
  id: "groceries",
  name: "Groceries",
  type: "expense",
});
const categories = [income, travel, groceries];
const container = makeGeneralContainer();
const ledgerTransactions = [
  makeTransaction({
    id: "salary-before",
    date: "2026-07-22",
    amount: 500_000,
    vendor_source: "Acme Payroll",
    category_id: income.id,
  }),
  makeTransaction({
    id: "travel-before",
    date: "2026-07-15",
    amount: -60_000,
    vendor_source: "Airline",
    category_id: travel.id,
  }),
  makeTransaction({
    id: "groceries-before",
    date: "2026-07-16",
    amount: -20_000,
    vendor_source: "Market",
    category_id: groceries.id,
  }),
  makeTransaction({
    id: "salary-now",
    date: "2026-08-20",
    amount: 470_000,
    vendor_source: "Acme Payroll",
    category_id: income.id,
  }),
  makeTransaction({
    id: "travel-now",
    date: "2026-08-05",
    amount: -15_000,
    vendor_source: "Airline",
    category_id: travel.id,
  }),
  makeTransaction({
    id: "groceries-now",
    date: "2026-08-10",
    amount: -8_000,
    vendor_source: "Market",
    category_id: groceries.id,
  }),
];
const reportTransactions = statsTransactions(ledgerTransactions, categories);

function context(range: WidgetContext["range"]): WidgetContext {
  return {
    range,
    today: "2026-08-23",
    categories,
    containers: [container],
    ledgerTransactions,
    reportTransactions,
    budgetTargets: [],
    snapshots: [],
    recurringRules: [],
    goals: [],
    aggregates: createDashboardAggregates({
      categories,
      containers: [container],
      ledgerTransactions,
      reportTransactions,
      recurringRules: [],
      snapshots: [],
      goals: [],
    }),
  };
}

it("keeps compact and expanded summaries exact and reconciled", () => {
  const ctx = context({ start: "2026-08-01", end: "2026-08-23" });
  const expanded = renderToStaticMarkup(<WhatChangedExpanded {...ctx} />);
  const compact = renderToStaticMarkup(<WhatChangedCompact {...ctx} />);

  expect(expanded).toContain('aria-label="You kept $270.00 more than the prior period"');
  expect(compact).toContain('aria-label="You kept $270.00 more than the prior period"');
  expect(expanded).toContain("Less Travel spending");
  expect(expanded).toContain("Lower Acme Payroll income");
  expect(expanded).toContain("Everything else");
  expect(compact).toContain("Drivers reconcile to +$270.00");
});

it("uses likely timing language and honest combined-period ledger links", () => {
  const ctx = context({ start: "2026-08-01", end: "2026-08-23" });
  const expanded = renderToStaticMarkup(<WhatChangedExpanded {...ctx} />);

  expect(expanded).toContain("Likely timing");
  expect(expanded).not.toContain("is timing");
  expect(expanded).toContain(
    "/ledger?category=travel&amp;from=2026-07-09&amp;to=2026-08-23",
  );
  expect(expanded).toContain(
    "/ledger?category=income&amp;q=Acme+Payroll&amp;from=2026-07-09&amp;to=2026-08-23",
  );
});

it("directs an unbounded period to a comparable choice", () => {
  const ctx = context({ start: null, end: null });
  const expanded = renderToStaticMarkup(<WhatChangedExpanded {...ctx} />);
  const compact = renderToStaticMarkup(<WhatChangedCompact {...ctx} />);

  expect(expanded).toContain("Choose a bounded period");
  expect(compact).toContain("Choose a bounded period");
});

it("keeps a durable directed empty state when both periods have no activity", () => {
  const ctx = context({ start: "2026-08-01", end: "2026-08-23" });
  const empty = {
    ...ctx,
    ledgerTransactions: [],
    reportTransactions: [],
    aggregates: createDashboardAggregates({
      categories,
      containers: [container],
      ledgerTransactions: [],
      reportTransactions: [],
      recurringRules: [],
      snapshots: [],
      goals: [],
    }),
  };
  const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === "saved")!;

  expect(definition.availability?.(empty)).toEqual({
    status: "empty",
    title: "Build a comparison history",
    description: "Approved entries in either matched period unlock this variance.",
    action: { label: "Open the ledger", href: "/ledger" },
  });
});

it("discloses signed current/prior inputs and every driver in shared math", () => {
  const ctx = context({ start: "2026-08-01", end: "2026-08-23" });
  const disclosure = DASHBOARD_WIDGETS.find((widget) => widget.id === "saved")!.math!(
    ctx,
  );

  expect(disclosure.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: "Current income", amount: 470_000 }),
      expect.objectContaining({
        label: "Current spending (signed ledger)",
        amount: -23_000,
      }),
      expect.objectContaining({ label: "Expense category: Travel", amount: 45_000 }),
      expect.objectContaining({ label: "Income source: Acme Payroll", amount: -30_000 }),
    ]),
  );
  expect(disclosure.exclusions).toContain("stats-hidden categories");
  expect(disclosure.rule).toContain("Everything else closes the exact difference");
});
