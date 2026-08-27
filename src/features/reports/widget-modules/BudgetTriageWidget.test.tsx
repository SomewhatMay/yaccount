import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  makeBudgetTarget,
  makeCategory,
  makeGeneralContainer,
  makeRecurringRule,
  makeTransaction,
} from "@/core/model";
import { createDashboardAggregates } from "../dashboard-aggregates";
import { DASHBOARD_WIDGETS, type WidgetContext } from "../registry";
import { BudgetTriageCompact, BudgetTriageExpanded } from "./BudgetTriageWidget";

const spent = makeCategory({ id: "spent", name: "Groceries", type: "expense" });
const projected = makeCategory({
  id: "projected",
  name: "Dining out",
  type: "expense",
});
const watch = makeCategory({ id: "watch", name: "Fuel", type: "expense" });
const onTrack = makeCategory({
  id: "on-track",
  name: "Household",
  type: "expense",
});
const categories = [spent, projected, watch, onTrack];
const transactions = [
  makeTransaction({
    id: "spent-row",
    date: "2026-08-05",
    amount: -11_000,
    vendor_source: "Market",
    category_id: spent.id,
  }),
  makeTransaction({
    id: "projected-row",
    date: "2026-08-05",
    amount: -2_000,
    vendor_source: "Cafe",
    category_id: projected.id,
  }),
  makeTransaction({
    id: "watch-row",
    date: "2026-08-05",
    amount: -9_000,
    vendor_source: "Station",
    category_id: watch.id,
  }),
  makeTransaction({
    id: "track-row",
    date: "2026-08-05",
    amount: -2_000,
    vendor_source: "Shop",
    category_id: onTrack.id,
  }),
];
const targets = categories.map((category) =>
  makeBudgetTarget({
    id: `target-${category.id}`,
    category_id: category.id,
    amount: 10_000,
    start_date: "2026-01-01",
  }),
);
const recurringRules = [
  makeRecurringRule({
    id: "dining-bill",
    frequency: "monthly",
    interval_config: { day_of_month: 20 },
    template_amount: -9_000,
    template_vendor_source: "Dinner booking",
    template_category_id: projected.id,
    template_container_id: "general",
    start_date: "2026-01-01",
  }),
];
const container = makeGeneralContainer();

function context(txns = transactions, budgets = targets): WidgetContext {
  return {
    range: { start: "2026-05-23", end: "2026-08-23" },
    today: "2026-08-06",
    cravingWins: [],
    categories,
    containers: [container],
    ledgerTransactions: txns,
    reportTransactions: txns,
    budgetTargets: budgets,
    snapshots: [],
    recurringRules,
    goals: [],
    aggregates: createDashboardAggregates({
      budgetTargets: budgets,
      categories,
      containers: [container],
      ledgerTransactions: txns,
      reportTransactions: txns,
      recurringRules,
      snapshots: [],
      goals: [],
    }),
  };
}

it("renders attention-first expanded and compact summaries from the same triage", () => {
  const ctx = context();
  const expanded = renderToStaticMarkup(<BudgetTriageExpanded {...ctx} />);
  const compact = renderToStaticMarkup(<BudgetTriageCompact {...ctx} />);
  const summary = "2 need attention; 1 worth watching; 1 on track";

  expect(expanded).toContain(`aria-label="${summary}"`);
  expect(compact).toContain(`aria-label="${summary}"`);
  expect(expanded.indexOf("Groceries")).toBeLessThan(expanded.indexOf("Dining out"));
  expect(expanded.indexOf("Dining out")).toBeLessThan(expanded.indexOf("Fuel"));
  expect(expanded).toContain("With scheduled spending, about $10.00 over by month end");
  expect(compact).toContain("Household");
});

it("links every category row to that exact category and current month", () => {
  const expanded = renderToStaticMarkup(<BudgetTriageExpanded {...context()} />);

  expect(expanded).toContain(
    "/ledger?category=spent&amp;from=2026-08-01&amp;to=2026-08-31",
  );
  expect(expanded).toContain('aria-label="Groceries: 110% spent; 19% of month elapsed"');
});

it("collapses an all-clear compact result to the smallest buffer", () => {
  const allClear = context(
    [
      makeTransaction({
        id: "small",
        date: "2026-08-05",
        amount: -1_000,
        vendor_source: "Small",
        category_id: spent.id,
      }),
    ],
    targets.map((target) => ({ ...target, amount: 100_000 })),
  );
  const compact = renderToStaticMarkup(<BudgetTriageCompact {...allClear} />);

  expect(compact).toContain("All 4 budgets are on track");
  expect(compact).toContain("Smallest buffer");
});

it("directs setup when no active expense budget applies", () => {
  const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === "pace")!;

  expect(definition.availability?.(context([], []))).toEqual({
    status: "needs-setup",
    title: "Set an expense budget",
    description: "A current category allowance unlocks budget triage.",
    action: { label: "Set a budget", href: "/categories" },
  });
});

it("separates actual, scheduled, inferred, and effective-budget math", () => {
  const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === "pace")!;
  const disclosure = definition.math!(context());

  expect(disclosure.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "actual",
        label: "Dining out: approved spend",
        amount: -2_000,
      }),
      expect.objectContaining({
        kind: "scheduled",
        label: "Dining out: known remaining",
        amount: -9_000,
      }),
      expect.objectContaining({
        kind: "context",
        label: "Dining out: effective budget",
        amount: 10_000,
      }),
    ]),
  );
  expect(disclosure.lines.some((line) => line.kind === "inferred")).toBe(false);
  expect(disclosure.rule).toContain("greater of linear day pace");
});
