import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  makeBudgetTarget,
  makeCategory,
  makeGeneralContainer,
  makeRecurringRule,
  makeTransaction,
  type BudgetTarget,
  type RecurringRule,
  type Transaction,
} from "@/core/model";
import { createDashboardAggregates } from "../dashboard-aggregates";
import { DASHBOARD_WIDGETS, type WidgetContext } from "../registry";
import { MoneyBriefCompact, MoneyBriefExpanded } from "./MoneyBriefWidget";

const general = makeGeneralContainer();
const groceries = makeCategory({
  id: "groceries",
  name: "Groceries",
  type: "expense",
});
const income = makeCategory({ id: "income", name: "Income", type: "income" });
const categories = [groceries, income];

function context(
  options: {
    transactions?: Transaction[];
    budgetTargets?: BudgetTarget[];
    recurringRules?: RecurringRule[];
  } = {},
): WidgetContext {
  const transactions = options.transactions ?? [];
  const budgetTargets = options.budgetTargets ?? [];
  const recurringRules = options.recurringRules ?? [];
  return {
    range: { start: "2026-05-23", end: "2026-08-23" },
    today: "2026-08-23",
    categories,
    containers: [general],
    ledgerTransactions: transactions,
    reportTransactions: transactions,
    budgetTargets,
    snapshots: [],
    recurringRules,
    goals: [],
    aggregates: createDashboardAggregates({
      budgetTargets,
      categories,
      containers: [general],
      ledgerTransactions: transactions,
      reportTransactions: transactions,
      recurringRules,
      snapshots: [],
      goals: [],
    }),
  };
}

function opening(): Transaction {
  return makeTransaction({
    id: "opening",
    date: "2026-08-01",
    amount: 200_000,
    vendor_source: "Opening",
    category_id: income.id,
  });
}

function powerRule(): RecurringRule {
  return makeRecurringRule({
    id: "power",
    frequency: "monthly",
    interval_config: { day_of_month: 28 },
    template_amount: -11_800,
    template_vendor_source: "Power",
    template_category_id: groceries.id,
    template_container_id: general.id,
    start_date: "2026-01-01",
  });
}

it("renders ranked pending and budget matters with compact parity", () => {
  const transactions = [
    opening(),
    makeTransaction({
      id: "groceries-spend",
      date: "2026-08-20",
      amount: -54_000,
      vendor_source: "Market",
      category_id: groceries.id,
    }),
    ...[1, 2, 3].map((index) =>
      makeTransaction({
        id: `pending-${index}`,
        date: "2026-08-23",
        amount: -1_000,
        vendor_source: `Pending ${index}`,
        category_id: groceries.id,
        inbox_status: "pending",
      }),
    ),
  ];
  const ctx = context({
    transactions,
    budgetTargets: [
      makeBudgetTarget({
        id: "groceries-budget",
        category_id: groceries.id,
        amount: 62_500,
        start_date: "2026-01-01",
      }),
    ],
    recurringRules: [powerRule()],
  });
  const expanded = renderToStaticMarkup(<MoneyBriefExpanded {...ctx} />);
  const compact = renderToStaticMarkup(<MoneyBriefCompact {...ctx} />);

  expect(expanded).toContain("Sunday, Aug 23");
  expect(expanded).toContain("2 things need you");
  expect(expanded).toContain("3 pending entries are ready to review.");
  expect(expanded).toContain("Groceries is projected $102.83 over this month.");
  expect(expanded).toContain("$85.00 left");
  expect(expanded).toContain('href="/inbox"');
  expect(expanded).toContain('href="/categories?focus=groceries"');
  expect(compact).toContain("2 need you");
  expect(compact).toContain("3 pending entries");
  expect(compact).toContain("Groceries: $85.00 left");
  expect(compact).toContain("Everything else is current.");
});

it("shows an all-clear next bill without making it an attention item", () => {
  const expanded = renderToStaticMarkup(
    <MoneyBriefExpanded
      {...context({ transactions: [opening()], recurringRules: [powerRule()] })}
    />,
  );

  expect(expanded).toContain("Nothing needs you right now.");
  expect(expanded).toContain("Next known bill: Power, Aug 28 · -$118.00");
  expect(expanded).not.toContain("1 thing needs you");
});

it("uses honest incomplete-data copy when no schedule exists", () => {
  const compact = renderToStaticMarkup(
    <MoneyBriefCompact {...context({ transactions: [opening()] })} />,
  );

  expect(compact).toContain("Nothing needs you right now.");
  expect(compact).toContain("No scheduled context yet.");
  expect(compact).toContain('href="/recurring"');
});

it("discloses priority inputs, cap, and ordinary-bill exclusion", () => {
  const ctx = context({ transactions: [opening()], recurringRules: [powerRule()] });
  const disclosure = DASHBOARD_WIDGETS.find((widget) => widget.id === "brief")!.math!(
    ctx,
  );

  expect(disclosure.lines).toContainEqual({
    kind: "scheduled",
    label: "2026-08-28: Power",
    amount: -11_800,
    note: "All-clear context only; not an attention item.",
  });
  expect(disclosure.exclusions).toContain(
    "ordinary upcoming bills from attention ranking",
  );
  expect(disclosure.exclusions).toContain(
    "month-close acknowledgement and unmatched-occurrence claims",
  );
  expect(disclosure.rule).toContain("Show at most three");
});
