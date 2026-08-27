import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  makeContainer,
  makeGeneralContainer,
  makeGoal,
  makeTransfer,
} from "@/core/model";
import { createDashboardAggregates } from "../dashboard-aggregates";
import { DASHBOARD_WIDGETS, type WidgetContext } from "../registry";
import { GoalOutlookCompact, GoalOutlookExpanded } from "./GoalOutlookWidget";

const general = makeGeneralContainer();
const portugal = makeContainer({ id: "portugal-c", name: "Portugal" });
const reserve = makeContainer({ id: "reserve-c", name: "Emergency reserve" });
const laptop = makeContainer({ id: "laptop-c", name: "Laptop" });
const loose = makeContainer({ id: "loose-c", name: "Loose" });
const containers = [general, portugal, reserve, laptop, loose];
const goals = [
  makeGoal({
    id: "portugal",
    container_id: portugal.id,
    name: "Portugal",
    kind: "spend_down",
    mode: "deadline",
    target_amount: 12_000,
    deadline: "2026-11-30",
    created_date: "2026-01-01",
  }),
  makeGoal({
    id: "reserve",
    container_id: reserve.id,
    name: "Emergency reserve",
    kind: "reserve",
    mode: "fixed",
    target_amount: 10_000,
    planned_monthly: 1_000,
    created_date: "2026-01-01",
  }),
  makeGoal({
    id: "laptop",
    container_id: laptop.id,
    name: "Laptop",
    kind: "spend_down",
    mode: "passive",
    target_amount: 20_000,
    created_date: "2026-01-01",
  }),
  makeGoal({
    id: "loose",
    container_id: loose.id,
    name: "Ongoing",
    kind: "spend_down",
    mode: "fixed",
    planned_monthly: 500,
    created_date: "2026-01-01",
  }),
];
const transactions = [
  makeTransfer({
    id: "reserve-in",
    date: "2026-07-01",
    amount: 7_000,
    container_id: general.id,
    to_container_id: reserve.id,
    fromName: "General",
    toName: "Reserve",
  }),
  makeTransfer({
    id: "laptop-in",
    date: "2026-07-01",
    amount: 5_000,
    container_id: general.id,
    to_container_id: laptop.id,
    fromName: "General",
    toName: "Laptop",
  }),
];

function context(activeGoals = goals): WidgetContext {
  return {
    range: { start: "2026-05-23", end: "2026-08-23" },
    today: "2026-08-23",
    cravingWins: [],
    categories: [],
    containers,
    ledgerTransactions: transactions,
    reportTransactions: transactions,
    budgetTargets: [],
    snapshots: [],
    recurringRules: [],
    goals: activeGoals,
    aggregates: createDashboardAggregates({
      budgetTargets: [],
      categories: [],
      containers,
      ledgerTransactions: transactions,
      reportTransactions: transactions,
      recurringRules: [],
      snapshots: [],
      goals: activeGoals,
    }),
  };
}

it("renders deadline, fixed, passive, and open-ended plans with compact parity", () => {
  const ctx = context();
  const expanded = renderToStaticMarkup(<GoalOutlookExpanded {...ctx} />);
  const compact = renderToStaticMarkup(<GoalOutlookCompact {...ctx} />);
  const summary = "3 on track; 0 need a change; 1 passive";

  expect(expanded).toContain(`aria-label="${summary}; $45.00 planned this month"`);
  expect(compact).toContain(`aria-label="${summary}; $45.00 planned this month"`);
  expect(expanded).toContain("$30.00/month reaches the target by Nov 2026");
  expect(expanded).toContain("$10.00/month points to Nov 2026");
  expect(expanded).toContain("Tracking progress without a monthly ask");
  expect(expanded).toContain("$5.00/month planned; no fixed finish line");
});

it("uses exact goal focus links and accessible progress summaries", () => {
  const expanded = renderToStaticMarkup(<GoalOutlookExpanded {...context()} />);

  expect(expanded).toContain("/goals?focus=portugal");
  expect(expanded).toContain('aria-label="Emergency reserve: 70% of $100.00"');
  expect(expanded).toContain("Reserve basis");
});

it("keeps a directed state after active goals disappear", () => {
  const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === "goals")!;

  expect(definition.availability?.(context([]))).toEqual({
    status: "needs-setup",
    title: "Create an active goal",
    description: "A goal plan unlocks finish lines and monthly asks.",
    action: { label: "Set up a goal", href: "/goals" },
  });
});

it("discloses each goal basis, ask, and finish-line rule", () => {
  const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === "goals")!;
  const disclosure = definition.math!(context());

  expect(disclosure.range).toBe("As of 2026-08-23");
  expect(disclosure.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "actual",
        label: "Emergency reserve: reserve balance",
        amount: 7_000,
      }),
      expect.objectContaining({
        kind: "scheduled",
        label: "Portugal: monthly ask",
        amount: 3_000,
      }),
      expect.objectContaining({
        kind: "context",
        label: "Portugal: deadline",
        value: "2026-11-30",
      }),
      expect.objectContaining({
        kind: "inferred",
        label: "Emergency reserve: projected completion",
        value: "2026-11-23",
      }),
    ]),
  );
  expect(disclosure.exclusions).toContain("Pending transfers");
  expect(disclosure.rule).toContain("Reserve goals use the live container balance");
});
