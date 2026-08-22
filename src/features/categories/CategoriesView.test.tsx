import { expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { makeCategory } from "@/core/model";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { CategoriesView } from "./CategoriesView";

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
  useSetAtom: () => vi.fn(),
}));

vi.mock("@/features/store", () => ({
  readyAtom: "ready",
  categoriesAtom: "categories",
  budgetTargetsAtom: "budgetTargets",
  dispatchAtom: "dispatch",
  dispatchManyAtom: "dispatchMany",
  flashRowAtom: "flashRow",
}));

vi.mock("@/features/prefs", () => ({
  useLocalPref: () => ["name", vi.fn()],
}));

vi.mock("@/features/useFocusParam", () => ({ useFocusParam: vi.fn() }));

vi.mock("@/features/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/ui")>();
  return {
    ...actual,
    useFlashRow: () => ({ ref: { current: null }, flashed: false }),
  };
});

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

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return textOf(node.props.children);
}

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement<{ children?: ReactNode }>) => boolean,
): ReactElement<{ children?: ReactNode }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  if (predicate(node)) return node;
  return findElement(node.props.children, predicate);
}

function renderCategoryRow(excludedFromStats: boolean) {
  const category = {
    ...makeCategory({ id: "hidden", name: "Hidden category", type: "expense" }),
    excluded_from_stats: excludedFromStats,
  };
  fixture.values.set("ready", true);
  fixture.values.set("categories", [category]);
  fixture.values.set("budgetTargets", []);

  const view = CategoriesView();
  const sectionElement = findComponent(view, "CategorySection")!;
  const section = (sectionElement.type as (props: Record<string, unknown>) => ReactNode)(
    sectionElement.props,
  );
  const rowElement = findComponent(section, "CategoryRow")!;
  const row = (rowElement.type as (props: Record<string, unknown>) => ReactNode)(
    rowElement.props,
  );
  return row;
}

it("switches one stats action between visible and hidden icons", () => {
  const includedRow = renderCategoryRow(false);
  const hideAction = findElement(
    includedRow,
    (element) =>
      element.type === DropdownMenuItem && textOf(element).trim() === "Hide from stats",
  );
  expect(hideAction).not.toBeNull();
  expect(
    findElement(hideAction, (element) => element.type === EyeOffIcon),
  ).not.toBeNull();
  expect(
    findElement(includedRow, (element) => element.type === DropdownMenuCheckboxItem),
  ).toBeNull();

  const excludedRow = renderCategoryRow(true);
  const showAction = findElement(
    excludedRow,
    (element) =>
      element.type === DropdownMenuItem && textOf(element).trim() === "Show in stats",
  );
  expect(showAction).not.toBeNull();
  expect(findElement(showAction, (element) => element.type === EyeIcon)).not.toBeNull();
  expect(textOf(excludedRow)).toContain("Hidden from stats");
  expect(
    findElement(excludedRow, (element) => element.type === DropdownMenuCheckboxItem),
  ).toBeNull();
});
