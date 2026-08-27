import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  makeBudgetTarget,
  makeCategory,
  makeGeneralContainer,
  makeGoal,
  makeRecurringRule,
  makeTransaction,
  type BudgetTarget,
  type Goal,
  type RecurringRule,
  type Transaction,
} from "@/core/model";
import { createDashboardAggregates } from "../dashboard-aggregates";
import { DASHBOARD_WIDGETS, type WidgetContext } from "../registry";
import {
  AllocationPlanCompact,
  AllocationPlanExpanded,
  AllocationPlanSettings,
} from "./AllocationPlanWidget";

const general = makeGeneralContainer();
const salaryCategory = makeCategory({
  id: "salary-category",
  name: "Salary",
  type: "income",
});
const sideCategory = makeCategory({
  id: "side-category",
  name: "Side work",
  type: "income",
});
const spending = makeCategory({
  id: "spending",
  name: "Expense plan",
  type: "expense",
});
const categories = [salaryCategory, sideCategory, spending];

function rule(
  id: string,
  day: number,
  amount: number,
  categoryId: string,
): RecurringRule {
  return makeRecurringRule({
    id,
    frequency: "monthly",
    interval_config: { day_of_month: day },
    template_vendor_source: id,
    template_container_id: general.id,
    template_category_id: categoryId,
    template_amount: amount,
    start_date: "2026-01-01",
  });
}

function goal(monthly: number): Goal {
  return makeGoal({
    id: "reserve-goal",
    container_id: "reserve",
    name: "Reserve",
    kind: "spend_down",
    mode: "fixed",
    planned_monthly: monthly,
    created_date: "2026-01-01",
  });
}

function context(
  options: {
    rules?: RecurringRule[];
    transactions?: Transaction[];
    budgets?: BudgetTarget[];
    goals?: Goal[];
    settings?: Record<string, unknown>;
    save?: (settings: Record<string, unknown>) => Promise<void>;
    manualIncome?: number;
  } = {},
): WidgetContext {
  const recurringRules = options.rules ?? [
    rule("Salary", 30, 580_000, salaryCategory.id),
  ];
  const transactions = options.transactions ?? [
    makeTransaction({
      id: "received",
      date: "2026-08-15",
      amount: 435_000,
      vendor_source: "Salary received",
      category_id: salaryCategory.id,
    }),
  ];
  const budgetTargets = options.budgets ?? [
    makeBudgetTarget({
      category_id: spending.id,
      amount: 426_000,
      start_date: "2026-01-01",
    }),
  ];
  const goals = options.goals ?? [goal(59_000)];
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
    goals,
    aggregates: createDashboardAggregates({
      budgetTargets,
      categories,
      containers: [general],
      ledgerTransactions: transactions,
      reportTransactions: transactions,
      recurringRules,
      snapshots: [],
      goals,
    }),
    instanceSettings: options.settings ?? {},
    saveInstanceSettings: options.save ?? vi.fn(async () => {}),
    syncedSettings: [
      {
        key: "expected_income:2026-08",
        value: String(options.manualIncome ?? 0),
      },
    ],
  };
}

function findByAriaLabel(
  node: ReactNode,
  label: string,
): ReactElement<{
  disabled?: boolean;
  onClick?: () => void;
  onCheckedChange?: (checked: boolean) => void;
}> | null {
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
    return node as ReactElement<{
      disabled?: boolean;
      onClick?: () => void;
      onCheckedChange?: (checked: boolean) => void;
    }>;
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

it("renders the current monthly allocation identity with compact parity", () => {
  const expanded = renderToStaticMarkup(<AllocationPlanExpanded {...context()} />);
  const compact = renderToStaticMarkup(<AllocationPlanCompact {...context()} />);

  expect(expanded).toContain("August expected income");
  expect(expanded).toContain('aria-label="Expected income: $5,800.00"');
  expect(expanded).toContain('aria-label="Received: $4,350.00"');
  expect(expanded).toContain('aria-label="Still scheduled: $1,450.00"');
  expect(expanded).toContain('aria-label="Expense budgets: -$4,260.00"');
  expect(expanded).toContain('aria-label="Goal asks: -$590.00"');
  expect(expanded).toContain('aria-label="Unplanned expected income: $950.00"');
  expect(compact).toContain('aria-label="Expected income: $5,800.00"');
  expect(compact).toContain('aria-label="Planned: -$4,850.00"');
  expect(compact).toContain('aria-label="Unplanned: $950.00"');
});

it("names over-planning without making a cash-safety claim", () => {
  const expanded = renderToStaticMarkup(
    <AllocationPlanExpanded
      {...context({
        rules: [rule("Salary", 30, 100_000, salaryCategory.id)],
        transactions: [],
        budgets: [
          makeBudgetTarget({
            category_id: spending.id,
            amount: 120_000,
            start_date: "2026-01-01",
          }),
        ],
        goals: [],
      })}
    />,
  );

  expect(expanded).toContain('aria-label="Plan exceeds income by $200.00"');
  expect(expanded.toLowerCase()).not.toContain("safe to spend");
  expect(expanded.toLowerCase()).not.toContain("cash available");
});

it("renders a selected pay cycle and keeps income anchors in settings", () => {
  const salary = makeRecurringRule({
    id: "Salary",
    frequency: "biweekly",
    interval_config: { days_of_month: [16, 30] },
    template_vendor_source: "Salary",
    template_container_id: general.id,
    template_category_id: salaryCategory.id,
    template_amount: 290_000,
    start_date: "2026-01-01",
  });
  const side = rule("Side work", 25, 10_000, sideCategory.id);
  const power = rule("Power", 24, -2_000, spending.id);
  const ctx = context({
    rules: [salary, side, power],
    transactions: [],
    budgets: [
      makeBudgetTarget({
        category_id: spending.id,
        amount: 31_000,
        start_date: "2026-01-01",
      }),
    ],
    goals: [goal(31_000)],
    settings: {
      allocationMode: "pay-cycle",
      payCycleAnchorRuleIds: [salary.id],
    },
  });
  const expanded = renderToStaticMarkup(<AllocationPlanExpanded {...ctx} />);
  const settings = renderToStaticMarkup(<AllocationPlanSettings {...ctx} />);

  expect(expanded).toContain("Aug 16 – Aug 29");
  expect(expanded).toContain("Next income in 7 days");
  expect(expanded).toContain('aria-label="Income for this cycle: $3,000.00"');
  expect(expanded).toContain('aria-label="Power: -$20.00"');
  expect(expanded).toContain('aria-label="Flexible budget share: -$50.00"');
  expect(expanded).toContain('aria-label="Goal asks: -$70.00"');
  expect(expanded).toContain('aria-label="Unplanned for this cycle: $2,860.00"');
  expect(expanded).not.toContain('aria-label="Allocation mode"');
  expect(expanded).not.toContain('aria-label="Use Salary as a pay-cycle anchor"');
  expect(settings).toContain('aria-label="Use Salary as a pay-cycle anchor"');
  expect(settings).toContain('aria-label="Use Side work as a pay-cycle anchor"');
});

it("persists mode and anchor choices through instance settings", () => {
  const salary = rule("Salary", 30, 290_000, salaryCategory.id);
  const side = rule("Side work", 25, 10_000, sideCategory.id);
  const save = vi.fn(async () => {});
  const ctx = context({ rules: [salary, side], transactions: [], save });
  const monthTree = AllocationPlanSettings(ctx);

  findByAriaLabel(monthTree, "Plan by pay cycle")?.props.onClick?.();
  expect(save).toHaveBeenCalledWith({ allocationMode: "pay-cycle" });

  save.mockClear();
  const payTree = AllocationPlanSettings({
    ...ctx,
    instanceSettings: { allocationMode: "pay-cycle" },
  });
  findByAriaLabel(
    payTree,
    "Use Side work as a pay-cycle anchor",
  )?.props.onCheckedChange?.(false);
  expect(save).toHaveBeenCalledWith({
    allocationMode: "pay-cycle",
    payCycleAnchorRuleIds: [salary.id],
  });
});

it("keeps the final pay-cycle income anchor selected", () => {
  const salary = rule("Salary", 30, 290_000, salaryCategory.id);
  const save = vi.fn(async () => {});
  const tree = AllocationPlanSettings(
    context({
      rules: [salary],
      transactions: [],
      save,
      settings: { allocationMode: "pay-cycle" },
    }),
  );
  const anchor = findByAriaLabel(tree, "Use Salary as a pay-cycle anchor");

  expect(anchor?.props.disabled).toBe(true);
  anchor?.props.onCheckedChange?.(false);
  expect(save).not.toHaveBeenCalled();
});

it("hides pay-cycle mode and directs setup when no next income is known", () => {
  const expanded = renderToStaticMarkup(
    <AllocationPlanExpanded
      {...context({
        rules: [],
        transactions: [],
        settings: { allocationMode: "pay-cycle" },
      })}
    />,
  );

  expect(expanded).not.toContain('aria-label="Plan by pay cycle"');
  expect(expanded).toContain("Pay cycle needs a next scheduled income");
  expect(expanded).toContain("Review income rules");
});

it("directs setup when no income or planned job exists", () => {
  const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === "allocation")!;

  expect(
    definition.availability?.(
      context({ rules: [], transactions: [], budgets: [], goals: [] }),
    ),
  ).toEqual({
    status: "needs-setup",
    title: "Schedule expected income",
    description: "A recurring income rule unlocks the allocation plan.",
    action: { label: "Add recurring income", href: "/recurring" },
  });
});

it("discloses actual, scheduled, and plan math without a cash claim", () => {
  const disclosure = DASHBOARD_WIDGETS.find((widget) => widget.id === "allocation")!
    .math!(context());

  expect(disclosure.range).toBe("August 2026 · as of 2026-08-23");
  expect(disclosure.lines).toEqual([
    { kind: "actual", label: "Received income", amount: 435_000 },
    { kind: "scheduled", label: "Still scheduled", amount: 145_000 },
    { kind: "context", label: "Expense budgets", amount: -426_000 },
    { kind: "context", label: "Goal asks", amount: -59_000 },
    {
      kind: "context",
      label: "Unplanned expected income",
      amount: 95_000,
    },
  ]);
  expect(disclosure.exclusions).toContain("cash-balance and safe-to-spend claims");
  expect(disclosure.rule).toContain("subtract effective expense budgets");
});
