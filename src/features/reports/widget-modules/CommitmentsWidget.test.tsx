import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  makeCategory,
  makeGeneralContainer,
  makeRecurringRule,
  type RecurringRule,
} from "@/core/model";
import { createDashboardAggregates } from "../dashboard-aggregates";
import { DASHBOARD_WIDGETS, type WidgetContext } from "../registry";
import {
  CommitmentsCompact,
  CommitmentsExpanded,
  CommitmentsSettings,
} from "./CommitmentsWidget";

const general = makeGeneralContainer();
const housing = makeCategory({ id: "housing", name: "Housing", type: "expense" });
const utilities = makeCategory({
  id: "utilities",
  name: "Utilities",
  type: "expense",
});
const categories = [housing, utilities];

function rules(): RecurringRule[] {
  return [
    makeRecurringRule({
      id: "rent",
      frequency: "monthly",
      interval_config: { day_of_month: 1 },
      template_vendor_source: "Rent",
      template_container_id: general.id,
      template_category_id: housing.id,
      template_amount: -160_000,
      start_date: "2026-01-01",
    }),
    makeRecurringRule({
      id: "internet",
      frequency: "monthly",
      interval_config: { day_of_month: 27 },
      template_vendor_source: "Internet",
      template_container_id: general.id,
      template_category_id: utilities.id,
      template_amount: -6_500,
      start_date: "2026-01-01",
    }),
    makeRecurringRule({
      id: "later",
      frequency: "monthly",
      interval_config: { day_of_month: 1 },
      template_vendor_source: "Goal contribution",
      template_container_id: general.id,
      template_category_id: utilities.id,
      template_amount: null,
      amount_mode: "goal_derived",
      linked_goal_id: "goal",
      start_date: "2026-01-01",
    }),
    makeRecurringRule({
      id: "insurance",
      frequency: "annually",
      interval_config: { month: 9, day: 3 },
      template_vendor_source: "Car insurance",
      template_container_id: general.id,
      template_category_id: utilities.id,
      template_amount: -84_000,
      start_date: "2026-01-01",
    }),
    makeRecurringRule({
      id: "dues",
      frequency: "custom",
      interval_config: { every: 3, unit: "month" },
      template_vendor_source: "Professional dues",
      template_container_id: general.id,
      template_category_id: utilities.id,
      template_amount: -15_900,
      start_date: "2026-01-15",
    }),
  ];
}

function context(
  options: {
    settings?: Record<string, unknown>;
    save?: (settings: Record<string, unknown>) => Promise<void>;
  } = {},
): WidgetContext {
  const recurringRules = rules();
  return {
    range: { start: "2026-05-23", end: "2026-08-23" },
    today: "2026-08-23",
    categories,
    containers: [general],
    ledgerTransactions: [],
    reportTransactions: [],
    budgetTargets: [],
    snapshots: [],
    recurringRules,
    goals: [],
    aggregates: createDashboardAggregates({
      budgetTargets: [],
      categories,
      containers: [general],
      ledgerTransactions: [],
      reportTransactions: [],
      recurringRules,
      snapshots: [],
      goals: [],
    }),
    instanceSettings: options.settings ?? {},
    saveInstanceSettings: options.save ?? vi.fn(async () => {}),
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

it("renders Regular contracts by category with compact parity", () => {
  const expanded = renderToStaticMarkup(<CommitmentsExpanded {...context()} />);
  const compact = renderToStaticMarkup(<CommitmentsCompact {...context()} />);

  expect(expanded).toContain('aria-label="Scheduled monthly load: $1,665.00"');
  expect(expanded).toContain("Housing");
  expect(expanded).toContain("Utilities");
  expect(expanded).toContain('href="/recurring?focus=rent"');
  expect(expanded).toContain('href="/recurring?focus=internet"');
  expect(expanded).toContain("Goal contribution");
  expect(expanded).toContain("set later");
  expect(expanded).toContain("Active expense rules normalized over exact occurrences");
  expect(expanded).not.toContain('aria-label="Commitment mode"');
  expect(compact).toContain('aria-label="Monthly load: $1,665.00"');
  expect(compact).toContain("Next: Internet, Aug 27");
  expect(compact).toContain("5 active expense rules");
});

it("renders Irregular costs as dated reserve rows and a reconciled month strip", () => {
  const ctx = context({ settings: { commitmentsMode: "irregular" } });
  const expanded = renderToStaticMarkup(<CommitmentsExpanded {...ctx} />);
  const compact = renderToStaticMarkup(<CommitmentsCompact {...ctx} />);

  expect(expanded).toContain('aria-label="Known in the next 12 months: $1,476.00"');
  expect(expanded).toContain("Sep 3");
  expect(expanded).toContain("Car insurance");
  expect(expanded).toContain('href="/recurring?focus=insurance"');
  expect(expanded).toContain("Professional dues");
  expect(expanded).toContain('aria-label="Monthly equivalent: $123.00"');
  expect(expanded).toContain("does not mean funds are reserved");
  expect(expanded).toContain("SEP");
  expect(expanded).toContain("OCT");
  expect(compact).toContain('aria-label="Monthly equivalent: $123.00"');
  expect(compact).toContain("Next: Car insurance, Sep 3");
});

it("persists the selected mode in synced instance settings", () => {
  const save = vi.fn(async () => {});
  const tree = CommitmentsSettings(context({ save, settings: { retained: true } }));

  findByAriaLabel(tree, "Show irregular commitments")?.props.onClick?.();

  expect(save).toHaveBeenCalledWith({ retained: true, commitmentsMode: "irregular" });
});

it("directs recurring setup when no expense schedule exists", () => {
  const base = context();
  const empty = {
    ...base,
    recurringRules: [],
    aggregates: createDashboardAggregates({
      budgetTargets: [],
      categories,
      containers: [general],
      ledgerTransactions: [],
      reportTransactions: [],
      recurringRules: [],
      snapshots: [],
      goals: [],
    }),
  };
  const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === "commitments")!;

  expect(definition.availability?.(empty)).toEqual({
    status: "needs-setup",
    title: "Schedule an expense",
    description: "An active recurring expense unlocks commitment planning.",
    action: { label: "Add a recurring expense", href: "/recurring" },
  });
});

it("discloses known totals, unknown amounts, and the normalization rule", () => {
  const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === "commitments")!;
  const disclosure = definition.math!(context());

  expect(disclosure.range).toBe("Aug 23, 2026 – Aug 22, 2027");
  expect(disclosure.lines).toEqual(
    expect.arrayContaining([
      { kind: "scheduled", label: "Rent · 12 occurrences", amount: -1_920_000 },
      {
        kind: "scheduled",
        label: "Goal contribution · 12 occurrences",
        value: "set later",
      },
      { kind: "context", label: "Regular monthly load", amount: -166_500 },
      { kind: "context", label: "Irregular monthly equivalent", amount: -12_300 },
    ]),
  );
  expect(disclosure.exclusions).toContain("income and transfers");
  expect(disclosure.rule).toContain("average Gregorian month");
  expect(disclosure.rule).toContain("rounded once");
});
