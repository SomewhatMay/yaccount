import { expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { defaultDashboardDefinition } from "./dashboard-layout";
import { DASHBOARD_WIDGETS } from "./registry";
import { DashboardSetBar } from "./DashboardSets";

interface ElementProps {
  children?: ReactNode;
  "aria-label"?: string;
  "aria-current"?: string;
  onClick?: (event: never) => void;
}

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: <T,>(initialValue: T) => [initialValue, vi.fn()],
  };
});

function findElements(
  node: ReactNode,
  predicate: (element: ReactElement<ElementProps>) => boolean,
): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => findElements(child, predicate));
  }
  if (!isValidElement<ElementProps>(node)) return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...findElements(node.props.children, predicate),
  ];
}

it("renders named dashboard tabs with accessible create and manage actions", () => {
  const overview = defaultDashboardDefinition(DASHBOARD_WIDGETS);
  const planning = { ...overview, id: "planning", name: "Planning", rank: 1 };
  const onSelect = vi.fn();
  const bar = DashboardSetBar({
    dashboards: [overview, planning],
    activeId: overview.id,
    defaultId: overview.id,
    onSelect,
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onReorder: vi.fn(),
    onMakeDefault: vi.fn(),
    onDelete: vi.fn(),
  });

  const nav = findElements(bar, (element) => element.type === "nav")[0];
  const buttons = findElements(nav, (element) => element.type === "button");
  const overviewTab = buttons.find((button) => button.props.children === "Overview")!;
  const planningTab = buttons.find((button) => button.props.children === "Planning")!;

  expect(nav.props["aria-label"]).toBe("Dashboard sets");
  expect(overviewTab.props["aria-current"]).toBe("page");
  expect(planningTab.props["aria-current"]).toBeUndefined();
  planningTab.props.onClick?.({} as never);
  expect(onSelect).toHaveBeenCalledWith(planning.id);
  expect(buttons.map((button) => button.props["aria-label"])).toContain("Add dashboard");
  expect(buttons.map((button) => button.props["aria-label"])).toContain(
    "Manage dashboards",
  );
});
