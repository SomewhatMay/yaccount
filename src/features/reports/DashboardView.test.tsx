import { expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { makeCategory, makeGeneralContainer, makeTransaction } from "@/core/model";
import { DashboardView } from "./DashboardView";
import type { WidgetContext, WidgetDef } from "./registry";

const fixture = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  periodKeys: [] as string[],
  compareKeys: [] as string[],
  curations: [] as unknown[],
  dispatchMany: vi.fn(async () => {}),
}));
const dashboardSets = vi.hoisted(() => ({
  dashboards: [
    {
      version: 2 as const,
      id: "overview",
      name: "Overview",
      rank: 0,
      isDeleted: false,
      instances: [
        {
          instanceId: "balance-instance",
          widgetType: "balance",
          size: "expanded" as const,
          hidden: false,
        },
        {
          instanceId: "saved-instance",
          widgetType: "saved",
          size: "compact" as const,
          hidden: false,
          subject: { type: "category" as const, id: "included" },
          settings: { horizonDays: 60 },
        },
      ],
    },
  ],
  activeDashboard: {
    version: 2 as const,
    id: "overview",
    name: "Overview",
    rank: 0,
    isDeleted: false,
    instances: [
      {
        instanceId: "balance-instance",
        widgetType: "balance",
        size: "expanded" as const,
        hidden: false,
      },
      {
        instanceId: "saved-instance",
        widgetType: "saved",
        size: "compact" as const,
        hidden: false,
        subject: { type: "category" as const, id: "included" },
        settings: { horizonDays: 60 },
      },
    ],
  },
  defaultDashboardId: "overview",
  layout: {
    order: ["balance-instance", "saved-instance"],
    hidden: [],
    sizes: { "balance-instance": "expanded", "saved-instance": "compact" },
  },
  setActiveDashboard: vi.fn(),
  saveDashboard: vi.fn(),
  saveLayout: vi.fn(),
  createDashboard: vi.fn(),
  renameDashboard: vi.fn(),
  duplicateDashboard: vi.fn(),
  reorderDashboard: vi.fn(),
  makeDefault: vi.fn(),
  deleteDashboard: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useMemo: <T,>(factory: () => T) => factory(),
    useState: <T,>(initialValue: T) => [initialValue, vi.fn()],
  };
});

vi.mock("jotai", () => ({
  useAtomValue: (atom: string) => fixture.values.get(atom),
  useSetAtom: () => fixture.dispatchMany,
}));

vi.mock("@/features/store", () => ({
  readyAtom: "ready",
  categoriesAtom: "categories",
  containersAtom: "containers",
  transactionsAtom: "transactions",
  budgetTargetsAtom: "budgetTargets",
  snapshotsAtom: "snapshots",
  recurringRulesAtom: "recurringRules",
  goalsAtom: "goals",
  settingsAtom: "settings",
  dispatchManyAtom: "dispatchMany",
}));

vi.mock("./period-pref", () => ({
  usePeriodPref: (key: string) => {
    fixture.periodKeys.push(key);
    return [{ kind: "preset", preset: "all" }, vi.fn()];
  },
  useComparePref: (key: string) => {
    fixture.compareKeys.push(key);
    return [null, vi.fn()];
  },
}));

vi.mock("./use-dashboard-layout", () => ({
  useDashboardSets: (curation: unknown) => {
    fixture.curations.push(curation);
    return dashboardSets;
  },
}));

function findComponent(
  node: ReactNode,
  name: string,
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findComponent(child, name);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  if (typeof node.type === "function" && node.type.name === name) {
    return node as ReactElement<Record<string, unknown>>;
  }
  return findComponent(node.props.children, name);
}

function findComponents(
  node: ReactNode,
  name: string,
): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => findComponents(child, name));
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [
    ...(typeof node.type === "function" && node.type.name === name
      ? [node as ReactElement<Record<string, unknown>>]
      : []),
    ...findComponents(node.props.children, name),
  ];
}

function callComponent<P>(element: ReactElement<P>) {
  return (element.type as (props: P) => ReactElement<Record<string, unknown>>)(
    element.props,
  );
}

it("keeps hidden-from-stats rows in balance while excluding them from reports", async () => {
  const included = makeCategory({ id: "included", name: "Included", type: "expense" });
  const excluded = {
    ...makeCategory({ id: "excluded", name: "Excluded", type: "expense" }),
    excluded_from_stats: true,
  };
  fixture.values.set("ready", true);
  fixture.values.set("categories", [included, excluded]);
  fixture.values.set("containers", [makeGeneralContainer()]);
  fixture.values.set("transactions", [
    makeTransaction({
      id: "included-row",
      date: "2026-08-01",
      amount: -1000,
      vendor_source: "Included expense",
      category_id: included.id,
    }),
    makeTransaction({
      id: "excluded-row",
      date: "2026-08-01",
      amount: -2000,
      vendor_source: "Excluded expense",
      category_id: excluded.id,
    }),
  ]);
  fixture.values.set("budgetTargets", []);
  fixture.values.set("snapshots", []);
  fixture.values.set("recurringRules", []);
  fixture.values.set("goals", []);
  fixture.values.set("settings", [{ key: "expected_income:2026-08", value: "250000" }]);
  fixture.periodKeys = [];
  fixture.compareKeys = [];
  fixture.curations = [];

  const dashboard = DashboardView();
  expect(fixture.curations).toEqual([
    [
      { widgetType: "balance", size: "expanded" },
      { widgetType: "brief", size: "expanded" },
      { widgetType: "recent", size: "expanded" },
    ],
  ]);
  expect(fixture.periodKeys).toEqual(["yaccount.dashboard.period.overview"]);
  expect(fixture.compareKeys).toEqual(["yaccount.dashboard.compare.overview"]);
  const setBar = findComponent(dashboard, "DashboardSetBar")!;
  expect(setBar.props.activeId).toBe("overview");
  const columnElement = findComponent(dashboard, "WidgetColumn")!;
  const column = callComponent(columnElement);
  const [balanceWidget, savedWidget] = findComponents(
    column,
    "DashboardWidget",
  ) as ReactElement<{
    def: WidgetDef;
    base: WidgetContext;
  }>[];
  expect(balanceWidget.props.base.aggregates).toBeDefined();
  expect(balanceWidget.props.base.aggregates).toBe(savedWidget.props.base.aggregates);
  expect(savedWidget.props.base.instanceSettings).toEqual({ horizonDays: 60 });
  expect(savedWidget.props.base.instanceSubject).toEqual({
    type: "category",
    id: "included",
  });
  expect(savedWidget.props.base.syncedSettings).toEqual([
    { key: "expected_income:2026-08", value: "250000" },
  ]);
  await savedWidget.props.base.dispatchOps?.([]);
  expect(fixture.dispatchMany).toHaveBeenCalledWith([]);
  await savedWidget.props.base.saveInstanceSettings?.({ horizonDays: 14 });
  expect(dashboardSets.saveDashboard).toHaveBeenCalledWith({
    ...dashboardSets.activeDashboard,
    instances: [
      dashboardSets.activeDashboard.instances[0],
      {
        ...dashboardSets.activeDashboard.instances[1],
        settings: { horizonDays: 14 },
      },
    ],
  });
  dashboardSets.saveDashboard.mockClear();
  await savedWidget.props.base.saveInstanceSubject?.({
    type: "category",
    id: "excluded",
  });
  expect(dashboardSets.saveDashboard).toHaveBeenCalledWith({
    ...dashboardSets.activeDashboard,
    instances: [
      dashboardSets.activeDashboard.instances[0],
      {
        ...dashboardSets.activeDashboard.instances[1],
        subject: { type: "category", id: "excluded" },
      },
    ],
  });
  const BalanceRenderer = (await balanceWidget.props.def.load!()).default as (
    context: WidgetContext,
  ) => ReactElement<Record<string, unknown>>;
  const balanceFigure = BalanceRenderer(balanceWidget.props.base);

  expect(balanceFigure.props.cents).toBe(-3000);
  expect(savedWidget.props.base.reportTransactions.map((row) => row.id)).toEqual([
    "included-row",
  ]);
  expect(savedWidget.props.base.aggregates.period({ start: null, end: null }).saved).toBe(
    -1000,
  );
});
