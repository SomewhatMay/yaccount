import { expect, it, vi } from "vitest";
import { makeCategory, makeGeneralContainer, makeTransaction } from "@/core/model";
import { DashboardView } from "./DashboardView";

const fixture = vi.hoisted(() => ({ values: new Map<string, unknown>() }));

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
  useDashboardLayout: () => [
    { order: ["balance", "saved"], hidden: [], version: 1 },
    vi.fn(),
  ],
}));

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
  const columnElement = dashboard.props.children[1];
  const column = columnElement.type(columnElement.props);
  const [balanceWidget, savedWidget] = column.props.children;
  const balanceElement = balanceWidget.props.def.render(balanceWidget.props.base);
  const savedElement = savedWidget.props.def.render(savedWidget.props.base);
  const balanceFigure = balanceElement.type(balanceElement.props);
  const savedFigure = savedElement.type(savedElement.props);

  expect(balanceFigure.props.cents).toBe(-3000);
  expect(savedFigure.props.cents).toBe(-1000);
});
