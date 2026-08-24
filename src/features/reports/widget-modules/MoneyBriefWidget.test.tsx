import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  makeBudgetTarget,
  makeCategory,
  makeContainer,
  makeContainerSnapshot,
  makeGeneralContainer,
  makeRecurringRule,
  makeTransaction,
  type BudgetTarget,
  type RecurringRule,
  type Transaction,
} from "@/core/model";
import type { Op } from "@/core/oplog";
import { createDashboardAggregates } from "../dashboard-aggregates";
import { DASHBOARD_WIDGETS, type WidgetContext } from "../registry";
import { MoneyBriefCompact, MoneyBriefExpanded } from "./MoneyBriefWidget";

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }));

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
    today?: string;
    containers?: ReturnType<typeof makeContainer>[];
    snapshots?: ReturnType<typeof makeContainerSnapshot>[];
    settings?: { key: string; value: string }[];
    dispatchOps?: (ops: Op[]) => Promise<void>;
  } = {},
): WidgetContext {
  const transactions = options.transactions ?? [];
  const budgetTargets = options.budgetTargets ?? [];
  const recurringRules = options.recurringRules ?? [];
  const containers = options.containers ?? [general];
  const snapshots = options.snapshots ?? [];
  return {
    range: { start: "2026-05-23", end: "2026-08-23" },
    today: options.today ?? "2026-08-23",
    categories,
    containers,
    ledgerTransactions: transactions,
    reportTransactions: transactions,
    budgetTargets,
    snapshots,
    recurringRules,
    goals: [],
    aggregates: createDashboardAggregates({
      budgetTargets,
      categories,
      containers,
      ledgerTransactions: transactions,
      reportTransactions: transactions,
      recurringRules,
      snapshots,
      goals: [],
    }),
    syncedSettings: options.settings,
    dispatchOps: options.dispatchOps,
  };
}

function findByAriaLabel(
  node: ReactNode,
  label: string,
): ReactElement<{ onClick?: () => void | Promise<void> }> | null {
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
    return node as ReactElement<{ onClick?: () => void | Promise<void> }>;
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
  expect(disclosure.exclusions).not.toContain(
    "month-close acknowledgement and unmatched-occurrence claims",
  );
  expect(disclosure.rule).toContain("Show at most three");
});

it("discloses each computed month-close signal and explicit-match boundary", () => {
  const salary = makeRecurringRule({
    id: "salary",
    frequency: "monthly",
    interval_config: { day_of_month: 30 },
    template_amount: 100_000,
    template_vendor_source: "Salary",
    template_category_id: income.id,
    template_container_id: general.id,
    start_date: "2026-01-01",
  });
  const brokerage = makeContainer({
    id: "brokerage",
    name: "Brokerage",
    is_investment: true,
  });
  const transactions = [
    makeTransaction({
      id: "overspend",
      date: "2026-07-15",
      amount: -60_000,
      vendor_source: "Market",
      category_id: groceries.id,
    }),
    makeTransaction({
      id: "salary-manual",
      date: "2026-07-29",
      amount: 100_000,
      vendor_source: "Salary deposit",
      category_id: income.id,
    }),
    makeTransaction({
      id: "pending",
      date: "2026-07-30",
      amount: 100_000,
      vendor_source: "Salary",
      category_id: income.id,
      recurring_rule_id: salary.id,
      recurring_occurrence_date: "2026-07-30",
      inbox_status: "pending",
    }),
  ];
  const disclosure = DASHBOARD_WIDGETS.find((widget) => widget.id === "brief")!.math!(
    context({
      today: "2026-08-02",
      transactions,
      recurringRules: [salary],
      containers: [general, brokerage],
      budgetTargets: [
        makeBudgetTarget({
          category_id: groceries.id,
          amount: 50_000,
          start_date: "2026-01-01",
        }),
      ],
    }),
  );

  expect(disclosure.lines).toContainEqual({
    kind: "actual",
    label: "July pending entries",
    value: "1",
  });
  expect(disclosure.lines).toContainEqual({
    kind: "actual",
    label: "July Groceries over allowance",
    amount: 10_000,
    note: "$600.00 spent against $500.00.",
  });
  expect(disclosure.lines).toContainEqual({
    kind: "scheduled",
    label: "2026-07-30: Salary unmatched",
    amount: 100_000,
    note: "1 manual candidate; none count until explicitly matched.",
  });
  expect(disclosure.lines).toContainEqual({
    kind: "context",
    label: "Investment values needing refresh for July close",
    value: "1",
  });
  expect(disclosure.exclusions).toContain(
    "manual candidates until explicitly matched to an expected occurrence",
  );
});

it("shows provable close work and explicitly links a manual candidate", async () => {
  toastSuccess.mockClear();
  const salary = makeRecurringRule({
    id: "salary",
    frequency: "monthly",
    interval_config: { day_of_month: 30 },
    template_amount: 100_000,
    template_vendor_source: "Salary",
    template_category_id: income.id,
    template_container_id: general.id,
    start_date: "2026-01-01",
  });
  const transactions = [
    makeTransaction({
      id: "overspend",
      date: "2026-07-15",
      amount: -60_000,
      vendor_source: "Market",
      category_id: groceries.id,
    }),
    makeTransaction({
      id: "salary-manual",
      date: "2026-07-29",
      amount: 100_000,
      vendor_source: "Salary deposit",
      category_id: income.id,
    }),
    makeTransaction({
      id: "salary-pending",
      date: "2026-07-30",
      amount: 100_000,
      vendor_source: "Salary",
      category_id: income.id,
      recurring_rule_id: salary.id,
      recurring_occurrence_date: "2026-07-30",
      inbox_status: "pending",
    }),
  ];
  const dispatchOps = vi.fn(async (_ops: Op[]) => {});
  const ctx = context({
    today: "2026-08-02",
    transactions,
    recurringRules: [salary],
    budgetTargets: [
      makeBudgetTarget({
        category_id: groceries.id,
        amount: 50_000,
        start_date: "2026-01-01",
      }),
    ],
    dispatchOps,
  });
  const tree = MoneyBriefExpanded(ctx);
  const expanded = renderToStaticMarkup(tree);
  const compact = renderToStaticMarkup(<MoneyBriefCompact {...ctx} />);

  expect(expanded).toContain("Close July");
  expect(expanded).toContain("1 of 4 done");
  expect(expanded).toContain("1 pending entry remains");
  expect(expanded).toContain("Groceries ended $100.00 above allowance");
  expect(expanded).toContain("1 expected occurrence is unmatched");
  expect(expanded).toContain("Investment values are current");
  expect(expanded).toContain("Salary deposit");
  expect(expanded).toContain("Jul 29");
  expect(compact).toContain("Close July · 3 open");

  await findByAriaLabel(
    tree,
    "Use Salary deposit entry for Salary on Jul 30",
  )?.props.onClick?.();

  expect(dispatchOps).toHaveBeenCalledTimes(1);
  const [match, dismiss] = dispatchOps.mock.calls[0][0];
  expect(match).toMatchObject({
    type: "transaction.update",
    payload: {
      row: {
        id: "salary-manual",
        date: "2026-07-29",
        recurring_rule_id: "salary",
        recurring_occurrence_date: "2026-07-30",
      },
    },
  });
  expect(dismiss).toMatchObject({
    type: "transaction.void",
    payload: { row: { reverses_id: "salary-pending" } },
  });
  expect(toastSuccess).toHaveBeenCalledWith(
    "Entry matched",
    expect.objectContaining({ action: expect.objectContaining({ label: "Undo" }) }),
  );

  dispatchOps.mockClear();
  const toastOptions = toastSuccess.mock.calls[0][1] as {
    action: { onClick: () => void };
  };
  toastOptions.action.onClick();
  await vi.waitFor(() => expect(dispatchOps).toHaveBeenCalledTimes(1));
  expect(dispatchOps.mock.calls[0][0]).toEqual([
    expect.objectContaining({
      type: "transaction.update",
      payload: { row: expect.objectContaining({ recurring_rule_id: null }) },
    }),
    expect.objectContaining({ type: "transaction.void" }),
  ]);
});

it("syncs month acknowledgement and hides resolved or acknowledged close work", async () => {
  const dispatchOps = vi.fn(async (_ops: Op[]) => {});
  const pending = makeTransaction({
    id: "pending",
    date: "2026-07-31",
    amount: -1_000,
    vendor_source: "Pending",
    category_id: groceries.id,
    inbox_status: "pending",
  });
  const ctx = context({
    today: "2026-08-02",
    transactions: [pending],
    dispatchOps,
  });
  const tree = MoneyBriefExpanded(ctx);

  await findByAriaLabel(tree, "Acknowledge July close")?.props.onClick?.();
  expect(dispatchOps).toHaveBeenCalledWith([
    expect.objectContaining({
      type: "setting.set",
      payload: {
        row: {
          key: "dashboard.month-close.v1.2026-07",
          value: "v1:acknowledged",
        },
      },
    }),
  ]);

  const acknowledged = renderToStaticMarkup(
    <MoneyBriefExpanded
      {...context({
        today: "2026-08-02",
        transactions: [pending],
        settings: [
          {
            key: "dashboard.month-close.v1.2026-07",
            value: "v1:acknowledged",
          },
        ],
      })}
    />,
  );
  const resolved = renderToStaticMarkup(
    <MoneyBriefExpanded {...context({ today: "2026-08-02" })} />,
  );
  const ordinaryDay = renderToStaticMarkup(
    <MoneyBriefExpanded {...context({ today: "2026-08-12", transactions: [pending] })} />,
  );

  expect(acknowledged).not.toContain("Close July");
  expect(resolved).not.toContain("Close July");
  expect(ordinaryDay).not.toContain("Close July");
});
