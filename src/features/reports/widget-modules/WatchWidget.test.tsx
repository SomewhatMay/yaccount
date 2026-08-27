import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  makeBudgetTarget,
  makeCategory,
  makeContainer,
  makeGeneralContainer,
  makeRecurringRule,
  makeTransaction,
  type Transaction,
} from "@/core/model";
import { createDashboardAggregates } from "../dashboard-aggregates";
import { DASHBOARD_WIDGETS, type WidgetContext } from "../registry";
import {
  CategoryWatchCompact,
  CategoryWatchExpanded,
  CategoryWatchSettings,
  ContainerWatchCompact,
  ContainerWatchExpanded,
  ContainerWatchSettings,
} from "./WatchWidget";

const general = makeGeneralContainer();
const reserve = makeContainer({ id: "reserve", name: "Reserve" });
const groceries = makeCategory({
  id: "groceries",
  name: "Groceries",
  type: "expense",
});
const dining = makeCategory({ id: "dining", name: "Dining", type: "expense" });
const income = makeCategory({ id: "income", name: "Income", type: "income" });
const categories = [groceries, dining, income];

function transaction(
  id: string,
  date: string,
  amount: number,
  categoryId = groceries.id,
): Transaction {
  return makeTransaction({
    id,
    date,
    amount,
    vendor_source: id,
    container_id: reserve.id,
    category_id: categoryId,
  });
}

function context(options: {
  subject: { type: string; id: string };
  transactions: Transaction[];
  containers?: ReturnType<typeof makeContainer>[];
  settings?: Record<string, unknown>;
  saveSubject?: (subject: { type: string; id: string }) => Promise<void>;
  saveSettings?: (settings: Record<string, unknown>) => Promise<void>;
}): WidgetContext {
  const containers = options.containers ?? [general, reserve];
  const budgetTargets = [
    makeBudgetTarget({
      id: "budget",
      category_id: groceries.id,
      amount: 62_500,
      start_date: "2026-01-01",
    }),
  ];
  const recurringRules = [
    makeRecurringRule({
      id: "storage",
      frequency: "monthly",
      interval_config: { day_of_month: 30 },
      template_amount: -47_200,
      template_vendor_source: "Storage",
      template_category_id: groceries.id,
      template_container_id: reserve.id,
      start_date: "2026-01-01",
    }),
  ];
  return {
    range: { start: "2026-06-23", end: "2026-08-23" },
    today: "2026-08-23",
    cravingWins: [],
    categories,
    containers,
    ledgerTransactions: options.transactions,
    reportTransactions: options.transactions,
    budgetTargets,
    snapshots: [],
    recurringRules,
    goals: [],
    instanceSubject: options.subject,
    instanceSettings: options.settings ?? {},
    saveInstanceSubject: options.saveSubject,
    saveInstanceSettings: options.saveSettings,
    aggregates: createDashboardAggregates({
      budgetTargets,
      categories,
      containers,
      ledgerTransactions: options.transactions,
      reportTransactions: options.transactions,
      recurringRules,
      snapshots: [],
      goals: [],
    }),
  };
}

function findComponent(
  node: ReactNode,
  name: string,
): ReactElement<{
  children?: ReactNode;
  onValueChange?: (value: string) => void;
}> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findComponent(child, name);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  if (typeof node.type === "function" && node.type.name === name) {
    return node as ReactElement<{
      children?: ReactNode;
      onValueChange?: (value: string) => void;
    }>;
  }
  return findComponent(node.props.children, name);
}

it("renders a raw container forecast and exact floor with compact parity", () => {
  const ctx = context({
    subject: { type: "container", id: reserve.id },
    transactions: [transaction("opening", "2026-08-01", 208_400, income.id)],
    settings: { floor: 150_000 },
  });
  const expanded = renderToStaticMarkup(<ContainerWatchExpanded {...ctx} />);
  const compact = renderToStaticMarkup(<ContainerWatchCompact {...ctx} />);
  const settings = renderToStaticMarkup(<ContainerWatchSettings {...ctx} />);

  expect(expanded).toContain("Watch: Reserve");
  expect(expanded).not.toContain("Reserve Change");
  expect(expanded).toContain('aria-label="Current balance: $2,084.00"');
  expect(expanded).toContain('aria-label="Scheduled low: $1,612.00 on Aug 30"');
  expect(expanded).toContain('aria-label="User floor: $1,500.00"');
  expect(expanded).toContain('aria-label="Distance above your floor: $112.00"');
  expect(expanded).toContain("forecast uses scheduled items only");
  expect(expanded).not.toContain('aria-label="Change watched container"');
  expect(expanded).not.toContain("Change your floor");
  expect(settings).toContain('aria-label="Change watched container"');
  expect(settings).toContain('aria-label="Container floor amount"');
  expect(compact).toContain("Watch: Reserve");
  expect(compact).toContain("Low $1,612.00");
  expect(compact).toContain("$112.00 above your floor");
});

it("renders category history, budget, and recent-pace projection", () => {
  const amounts = [51_000, 58_800, 64_200, 57_100, 67_000];
  const months = ["03", "04", "05", "06", "07"];
  const rows = months.map((month, index) =>
    transaction(`spent-${month}`, `2026-${month}-15`, -amounts[index]),
  );
  rows.push(
    transaction("aug-earlier", "2026-08-01", -39_400),
    transaction("aug-recent", "2026-08-20", -14_600),
  );
  const ctx = context({
    subject: { type: "category", id: groceries.id },
    transactions: rows,
  });
  const expanded = renderToStaticMarkup(<CategoryWatchExpanded {...ctx} />);
  const compact = renderToStaticMarkup(<CategoryWatchCompact {...ctx} />);
  const settings = renderToStaticMarkup(<CategoryWatchSettings {...ctx} />);

  expect(expanded).toContain("Watch: Groceries");
  expect(expanded).toContain(">$510<");
  expect(expanded).toContain('aria-label="August spending: $540.00 of $625.00"');
  expect(expanded).toContain('aria-label="Likely month end: $706.86"');
  expect(expanded).toContain('aria-label="Six-month median: $579.50"');
  expect(expanded).toContain('aria-label="Recent 7-day spend: $146.00"');
  expect(expanded).toContain("uses your recent 7-day pace");
  expect(compact).toContain("$540.00 of $625.00");
  expect(compact).toContain("Likely $706.86");
  expect(compact).toContain("$85.00 left");
  expect(expanded).not.toContain('aria-label="Change watched category"');
  expect(settings).toContain('aria-label="Change watched category"');
});

it("keeps a missing subject in place and changes to an explicit choice", () => {
  const archived = { ...reserve, is_archived: true };
  const save = vi.fn(async () => {});
  const ctx = context({
    subject: { type: "container", id: archived.id },
    transactions: [],
    containers: [general, archived],
    saveSubject: save,
  });
  const tree = ContainerWatchSettings(ctx);
  const html = renderToStaticMarkup(<ContainerWatchExpanded {...ctx} />);

  expect(html).toContain("Choose another container");
  const picker = findComponent(tree, "Select");
  picker?.props.onValueChange?.(general.id);
  expect(save).toHaveBeenCalledWith({ type: "container", id: general.id });
});

it("discloses subject-only cash and category projection math", () => {
  const containerContext = context({
    subject: { type: "container", id: reserve.id },
    transactions: [transaction("opening", "2026-08-01", 208_400, income.id)],
    settings: { floor: 150_000 },
  });
  const categoryContext = context({
    subject: { type: "category", id: groceries.id },
    transactions: [transaction("recent", "2026-08-20", -14_600)],
  });
  const containerMath = DASHBOARD_WIDGETS.find(
    (widget) => widget.id === "watch-container",
  )!.math!(containerContext);
  const categoryMath = DASHBOARD_WIDGETS.find((widget) => widget.id === "watch-category")!
    .math!(categoryContext);

  expect(containerMath.lines).toEqual(
    expect.arrayContaining([
      { kind: "actual", label: "Current balance", amount: 208_400 },
      { kind: "context", label: "User floor", amount: 150_000 },
      {
        kind: "context",
        label: "Distance above user floor",
        amount: 11_200,
      },
    ]),
  );
  expect(containerMath.exclusions).toContain("every other container");
  expect(containerMath.rule).toContain("never infer a floor");
  expect(categoryMath.lines).toEqual(
    expect.arrayContaining([
      { kind: "actual", label: "Recent 7-day spending", amount: 14_600 },
      { kind: "inferred", label: "Likely month end", amount: 31_286 },
    ]),
  );
  expect(categoryMath.exclusions).toContain("stats-hidden categories");
  expect(categoryMath.rule).toContain("recent-7-day daily pace");
});
