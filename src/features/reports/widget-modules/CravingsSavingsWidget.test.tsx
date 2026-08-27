import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { makeCravingWin, makeGeneralContainer, makeTransfer } from "@/core/model";
import { createDashboardAggregates } from "../dashboard-aggregates";
import { DASHBOARD_WIDGETS, type WidgetContext } from "../registry";
import { CravingsSavingsCompact, CravingsSavingsExpanded } from "./CravingsSavingsWidget";

const general = makeGeneralContainer();
const transfer = makeTransfer({
  id: "craving-transfer",
  date: "2026-08-20",
  amount: 1_200,
  container_id: general.id,
  to_container_id: "goal-container",
  fromName: "General",
  toName: "Trip",
});
const cravingWins = [
  makeCravingWin({
    id: "coffee",
    description: "Coffee machine",
    amount_kept: 2_500,
    date: "2026-01-10",
    occurred_at: "2026-01-10T14:00:00.000Z",
  }),
  makeCravingWin({
    id: "takeout",
    description: "Takeout",
    amount_kept: 1_200,
    date: "2026-08-20",
    occurred_at: "2026-08-20T22:00:00.000Z",
    goal_id: "trip",
    transfer_transaction_id: transfer.id,
  }),
];

function context(wins = cravingWins): WidgetContext {
  return {
    range: { start: "2026-08-01", end: "2026-08-31" },
    today: "2026-08-23",
    categories: [],
    containers: [general],
    cravingWins: wins,
    ledgerTransactions: [transfer],
    reportTransactions: [],
    budgetTargets: [],
    snapshots: [],
    recurringRules: [],
    goals: [],
    aggregates: createDashboardAggregates({
      budgetTargets: [],
      categories: [],
      containers: [general],
      ledgerTransactions: [transfer],
      reportTransactions: [],
      recurringRules: [],
      snapshots: [],
      goals: [],
    }),
  };
}

it("keeps the all-time total and supporting facts consistent at both sizes", () => {
  const expanded = renderToStaticMarkup(<CravingsSavingsExpanded {...context()} />);
  const compact = renderToStaticMarkup(<CravingsSavingsCompact {...context()} />);

  for (const markup of [expanded, compact]) {
    expect(markup).toContain("$37.00 kept across 2 wins");
    expect(markup).toContain("$12.00 this month");
    expect(markup).toContain('href="/cravings"');
  }
  expect(expanded).toContain("$12.00 moved to goals");
});

it("registers directed empty-state and all-time math", () => {
  const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === "cravings")!;

  expect(definition.fixedWindow).toBe(true);
  expect(definition.availability?.(context([]))).toEqual({
    status: "empty",
    title: "Log a craving win",
    description: "Record money you chose to keep instead of spending.",
    action: { label: "Open Cravings Savings", href: "/cravings" },
  });
  expect(definition.math?.(context())).toEqual(
    expect.objectContaining({
      range: "All time · as of 2026-08-23",
      lines: expect.arrayContaining([
        expect.objectContaining({ label: "Estimated spending avoided", amount: 3_700 }),
        expect.objectContaining({ label: "Actually moved to goals", amount: 1_200 }),
      ]),
      exclusions: expect.arrayContaining([
        "Craving wins from income, spending, budgets, and account balances",
      ]),
    }),
  );
});
