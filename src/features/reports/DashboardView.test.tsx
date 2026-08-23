import { expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { makeCategory, makeGeneralContainer, makeTransaction } from "@/core/model";
import { DashboardView } from "./DashboardView";
import type { WidgetContext, WidgetDef } from "./registry";

const fixture = vi.hoisted(() => ({ values: new Map<string, unknown>() }));
const dashboardSets = vi.hoisted(() => ({
  dashboards: [
    {
      version: 2 as const,
      id: "overview",
      name: "Overview",
      rank: 0,
      isDeleted: false,
      instances: [],
    },
  ],
  activeDashboard: {
    version: 2 as const,
    id: "overview",
    name: "Overview",
    rank: 0,
    isDeleted: false,
    instances: [],
  },
  defaultDashboardId: "overview",
  layout: { order: ["balance", "saved"], hidden: [] },
  setActiveDashboard: vi.fn(),
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
}));

vi.mock("./period-pref", () => ({
  usePeriodPref: () => [{ kind: "preset", preset: "all" }, vi.fn()],
  useComparePref: () => [null, vi.fn()],
}));

vi.mock("./use-dashboard-layout", () => ({
  useDashboardSets: () => dashboardSets,
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

function callComponent<P>(element: ReactElement<P>) {
  return (element.type as (props: P) => ReactElement<Record<string, unknown>>)(
    element.props,
  );
}

it("keeps hidden-from-stats rows in balance while excluding them from reports", () => {
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

  const dashboard = DashboardView();
  const setBar = findComponent(dashboard, "DashboardSetBar")!;
  expect(setBar.props.activeId).toBe("overview");
  const columnElement = findComponent(dashboard, "WidgetColumn")!;
  const column = callComponent(columnElement);
  const [balanceWidget, savedWidget] = column.props.children as ReactElement<{
    def: WidgetDef;
    base: WidgetContext;
  }>[];
  const balanceElement = balanceWidget.props.def.render(
    balanceWidget.props.base,
  ) as ReactElement;
  const savedElement = savedWidget.props.def.render(
    savedWidget.props.base,
  ) as ReactElement;
  const balanceFigure = callComponent(balanceElement);
  const savedFigure = callComponent(savedElement);

  expect(balanceFigure.props.cents).toBe(-3000);
  expect(savedFigure.props.cents).toBe(-1000);
});
