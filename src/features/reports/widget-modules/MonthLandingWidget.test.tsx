import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  makeCategory,
  makeGeneralContainer,
  makeTransaction,
  type Transaction,
} from "@/core/model";
import { createDashboardAggregates } from "../dashboard-aggregates";
import { DASHBOARD_WIDGETS, type WidgetContext } from "../registry";
import { MonthLandingCompact, MonthLandingExpanded } from "./MonthLandingWidget";

const general = makeGeneralContainer();
const income = makeCategory({ id: "income", name: "Income", type: "income" });
const expense = makeCategory({ id: "expense", name: "Expense", type: "expense" });
const categories = [income, expense];

const transactions = [
  makeTransaction({
    id: "coverage",
    date: "2026-05-01",
    amount: 100,
    vendor_source: "Coverage",
    category_id: income.id,
  }),
  makeTransaction({
    id: "may-flex",
    date: "2026-05-24",
    amount: -38_000,
    vendor_source: "May flexible",
    category_id: expense.id,
  }),
  makeTransaction({
    id: "june-flex",
    date: "2026-06-23",
    amount: -65_000,
    vendor_source: "June flexible",
    category_id: expense.id,
  }),
  makeTransaction({
    id: "july-flex",
    date: "2026-07-24",
    amount: -92_000,
    vendor_source: "July flexible",
    category_id: expense.id,
  }),
  makeTransaction({
    id: "current-income",
    date: "2026-08-10",
    amount: 300_000,
    vendor_source: "Current income",
    category_id: income.id,
  }),
  makeTransaction({
    id: "current-expense",
    date: "2026-08-15",
    amount: -59_000,
    vendor_source: "Current expense",
    category_id: expense.id,
  }),
  makeTransaction({
    id: "future-expense",
    date: "2026-08-27",
    amount: -71_000,
    vendor_source: "Known remaining",
    category_id: expense.id,
  }),
];

function context(rows: Transaction[] = transactions): WidgetContext {
  return {
    range: { start: "2026-05-23", end: "2026-08-23" },
    today: "2026-08-23",
    categories,
    containers: [general],
    ledgerTransactions: rows,
    reportTransactions: rows,
    budgetTargets: [],
    snapshots: [],
    recurringRules: [],
    goals: [],
    aggregates: createDashboardAggregates({
      budgetTargets: [],
      categories,
      containers: [general],
      ledgerTransactions: rows,
      reportTransactions: rows,
      recurringRules: [],
      snapshots: [],
      goals: [],
    }),
  };
}

it("renders the full landing range with compact parity", () => {
  const expanded = renderToStaticMarkup(<MonthLandingExpanded {...context()} />);
  const compact = renderToStaticMarkup(<MonthLandingCompact {...context()} />);

  expect(expanded).toContain("August 2026");
  expect(expanded).toContain('aria-label="Likely kept: $1,050.00"');
  expect(expanded).toContain('aria-label="Expected range: $780.00 to $1,320.00"');
  expect(expanded).toContain('aria-label="Kept so far: +$2,410.00"');
  expect(expanded).toContain('aria-label="Remaining scheduled net: -$710.00"');
  expect(expanded).toContain('aria-label="Usual flexible spending: -$650.00"');
  expect(expanded).toContain(
    'aria-label="Month runway from $2,410.00 kept so far to $1,050.00 likely kept"',
  );
  expect(expanded).toContain("last 3 comparable months");
  expect(compact).toContain('aria-label="Likely kept: $1,050.00"');
  expect(compact).toContain("$780.00 – $1,320.00");
  expect(compact).toContain("Known -$710.00; usual -$650.00");
});

it("shows a scheduled-only early estimate without inventing a range", () => {
  const earlyRows = transactions.filter((row) => row.date >= "2026-08-01");
  const expanded = renderToStaticMarkup(<MonthLandingExpanded {...context(earlyRows)} />);

  expect(expanded).toContain("Early estimate");
  expect(expanded).toContain("Scheduled items only");
  expect(expanded).not.toContain("Expected range");
  expect(expanded).not.toContain("Usual flexible spending");
});

it("keeps insufficient data directed in the gallery", () => {
  const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === "landing")!;

  expect(definition.availability?.(context([]))).toEqual({
    status: "insufficient-data",
    title: "Build a landing signal",
    description:
      "Two complete months of flexible spending or a remaining scheduled item unlocks this forecast.",
    action: { label: "Review activity", href: "/ledger" },
  });
});

it("discloses actual, scheduled, and inferred inputs separately", () => {
  const disclosure = DASHBOARD_WIDGETS.find((widget) => widget.id === "landing")!.math!(
    context(),
  );

  expect(disclosure.range).toBe("August 1–31, 2026 · actual through August 23");
  expect(disclosure.lines).toEqual(
    expect.arrayContaining([
      { kind: "actual", label: "Income through today", amount: 300_000 },
      {
        kind: "actual",
        label: "Categorized expenses through today",
        amount: -59_000,
      },
      { kind: "actual", label: "Kept so far", amount: 241_000 },
      { kind: "scheduled", label: "Remaining scheduled net", amount: -71_000 },
      { kind: "inferred", label: "Usual flexible spending", amount: -65_000 },
      { kind: "context", label: "Likely kept", amount: 105_000 },
    ]),
  );
  expect(disclosure.exclusions).toContain("transfers");
  expect(disclosure.exclusions).toContain("stats-hidden categories");
  expect(disclosure.rule).toContain("aligned remaining slices");
});
