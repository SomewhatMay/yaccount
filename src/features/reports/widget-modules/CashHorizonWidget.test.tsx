import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  makeCategory,
  makeGeneralContainer,
  makeRecurringRule,
  makeTransaction,
} from "@/core/model";
import { createDashboardAggregates } from "../dashboard-aggregates";
import { DASHBOARD_WIDGETS, type WidgetContext } from "../registry";
import {
  CashHorizonCompact,
  CashHorizonExpanded,
  CashHorizonSettings,
} from "./CashHorizonWidget";

const general = makeGeneralContainer();
const income = makeCategory({ id: "income", name: "Income", type: "income" });
const expense = makeCategory({ id: "expense", name: "Expense", type: "expense" });
const rules = [
  makeRecurringRule({
    id: "power",
    frequency: "monthly",
    interval_config: { day_of_month: 24 },
    template_amount: -11_800,
    template_vendor_source: "Power",
    template_category_id: expense.id,
    template_container_id: general.id,
    start_date: "2026-01-01",
  }),
  makeRecurringRule({
    id: "internet",
    frequency: "monthly",
    interval_config: { day_of_month: 27 },
    template_amount: -6_500,
    template_vendor_source: "Internet",
    template_category_id: expense.id,
    template_container_id: general.id,
    start_date: "2026-01-01",
  }),
  makeRecurringRule({
    id: "salary",
    frequency: "monthly",
    interval_config: { day_of_month: 30 },
    template_amount: 290_000,
    template_vendor_source: "Salary",
    template_category_id: income.id,
    template_container_id: general.id,
    start_date: "2026-01-01",
  }),
  makeRecurringRule({
    id: "rent",
    frequency: "monthly",
    interval_config: { day_of_month: 3 },
    template_amount: -160_000,
    template_vendor_source: "Rent",
    template_category_id: expense.id,
    template_container_id: general.id,
    start_date: "2026-01-01",
  }),
];
const transactions = [
  makeTransaction({
    id: "opening",
    date: "2026-08-01",
    amount: 100_000,
    vendor_source: "Opening",
    category_id: income.id,
  }),
];

function context(
  activeRules = rules,
  settings: Record<string, unknown> = { horizonDays: 30 },
  saveInstanceSettings = vi.fn(async () => {}),
): WidgetContext {
  const categories = [income, expense];
  return {
    range: { start: "2026-05-23", end: "2026-08-23" },
    today: "2026-08-23",
    categories,
    containers: [general],
    ledgerTransactions: transactions,
    reportTransactions: transactions,
    budgetTargets: [],
    snapshots: [],
    recurringRules: activeRules,
    goals: [],
    aggregates: createDashboardAggregates({
      budgetTargets: [],
      categories,
      containers: [general],
      ledgerTransactions: transactions,
      reportTransactions: transactions,
      recurringRules: activeRules,
      snapshots: [],
      goals: [],
    }),
    instanceSettings: settings,
    saveInstanceSettings,
  };
}

function findByAriaLabel(
  node: ReactNode,
  label: string,
): ReactElement<{ onClick?: () => void }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByAriaLabel(child, label);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement<{ children?: ReactNode; "aria-label"?: string }>(node)) {
    return null;
  }
  if (node.props["aria-label"] === label) {
    return node as ReactElement<{ onClick?: () => void }>;
  }
  if (typeof node.type === "function") {
    const render = node.type as (props: {
      children?: ReactNode;
      "aria-label"?: string;
    }) => ReactNode;
    const found = findByAriaLabel(render(node.props), label);
    if (found) return found;
  }
  return findByAriaLabel(node.props.children, label);
}

it("renders the low, next-income landmark, event links, and compact parity", () => {
  const expanded = renderToStaticMarkup(<CashHorizonExpanded {...context()} />);
  const compact = renderToStaticMarkup(<CashHorizonCompact {...context()} />);

  expect(expanded).toContain("Projected low");
  expect(expanded).toContain("$817.00 on Aug 27");
  expect(expanded).toContain("Next income in 7 days");
  expect(expanded).toContain("2 bills before then: -$183.00");
  expect(expanded).toContain("/recurring?focus=power");
  expect(expanded).toContain(
    "Scheduled items only; ordinary card spending is not predicted.",
  );
  expect(expanded).toContain('aria-label="Cash forecast from Aug 23 to Sep 22"');
  expect(expanded).toContain('aria-label="Today: $1,000.00"');
  expect(expanded).toContain('aria-label="Sep 22: $2,117.00"');
  expect(compact).toContain("Low: $817.00 on Aug 27");
  expect(compact).toContain("Next income: Aug 30, +$2,900.00");
  expect(expanded).not.toContain('aria-label="Forecast window"');
});

it("persists a horizon choice through the synced instance settings seam", () => {
  const save = vi.fn(async () => {});
  const ctx = context(rules, { horizonDays: 14, another: true }, save);
  const tree = CashHorizonSettings(ctx);
  const button = findByAriaLabel(tree, "Forecast 60 days");

  expect(renderToStaticMarkup(tree)).toContain('aria-pressed="true">14d');
  button?.props.onClick?.();
  expect(save).toHaveBeenCalledWith({ horizonDays: 60, another: true });
});

it("keeps the card directed when its active schedule disappears", () => {
  const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === "upcoming")!;

  expect(definition.availability?.(context([]))).toEqual({
    status: "needs-setup",
    title: "Schedule an income or bill",
    description: "An active recurring item unlocks the cash forecast.",
    action: { label: "Add a recurring item", href: "/recurring" },
  });
});

it("shows zero-crossing risk and discloses raw cash versus scheduled inputs", () => {
  const shortfallRule = makeRecurringRule({
    id: "shortfall",
    frequency: "monthly",
    interval_config: { day_of_month: 24 },
    template_amount: -120_000,
    template_vendor_source: "Large bill",
    template_category_id: expense.id,
    template_container_id: general.id,
    start_date: "2026-01-01",
  });
  const ctx = context([shortfallRule]);
  const expanded = renderToStaticMarkup(<CashHorizonExpanded {...ctx} />);
  const disclosure = DASHBOARD_WIDGETS.find((widget) => widget.id === "upcoming")!.math!(
    ctx,
  );

  expect(expanded).toContain("Below zero Aug 24");
  expect(expanded).toContain("largest shortfall");
  expect(expanded).toContain("$200.00");
  expect(disclosure.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "actual",
        label: "Included cash as of today",
        amount: 100_000,
      }),
      expect.objectContaining({
        kind: "scheduled",
        label: "2026-08-24: Large bill",
        amount: -120_000,
      }),
    ]),
  );
  expect(disclosure.exclusions).toContain("ordinary unscheduled spending");
  expect(disclosure.rule).toContain("Transfers inside included cash net to zero");
});
