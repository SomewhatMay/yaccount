import { expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { defaultDashboardDefinition } from "./dashboard-layout";
import { DASHBOARD_WIDGETS } from "./registry";
import { DashboardOverflowMenu, DashboardSetBar } from "./DashboardSets";

interface ElementProps {
  children?: ReactNode;
  "aria-label"?: string;
  "aria-current"?: string;
  onClick?: (event: never) => void;
  onSelect?: () => void;
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

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!isValidElement<ElementProps>(node)) return "";
  return textOf(node.props.children);
}

it("renders compact named dashboard tabs with one create action", () => {
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
  expect(buttons.map((button) => button.props["aria-label"])).not.toContain(
    "Manage dashboards",
  );
});

it("puts customization and dashboard management in one overflow menu", () => {
  const onCustomize = vi.fn();
  const onManage = vi.fn();
  const menu = DashboardOverflowMenu({ onCustomize, onManage });
  const trigger = findElements(
    menu,
    (element) => element.props["aria-label"] === "Dashboard options",
  )[0];
  const items = findElements(
    menu,
    (element) =>
      typeof element.type === "function" && element.type.name === "DropdownMenuItem",
  );

  expect(trigger).toBeDefined();
  expect(items.map((item) => textOf(item))).toEqual([
    "Customize dashboard",
    "Manage dashboards",
  ]);
  items[0].props.onSelect?.();
  items[1].props.onSelect?.();
  expect(onCustomize).toHaveBeenCalledOnce();
  expect(onManage).toHaveBeenCalledOnce();
});
