import { expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { makeCategory } from "@/core/model";
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

it("shows the stats toggle and a marker on an excluded category row", () => {
  const category = {
    ...makeCategory({ id: "hidden", name: "Hidden category", type: "expense" }),
    excluded_from_stats: true,
  };
  fixture.values.set("ready", true);
  fixture.values.set("categories", [category]);
  fixture.values.set("budgetTargets", []);

  const view = CategoriesView();
  const sectionElement = findComponent(view, "CategorySection")!;
  const section = (
    sectionElement.type as (props: Record<string, unknown>) => ReactNode
  )(sectionElement.props);
  const rowElement = findComponent(section, "CategoryRow")!;
  const row = (rowElement.type as (props: Record<string, unknown>) => ReactNode)(
    rowElement.props,
  );

  expect(textOf(row)).toContain("Hide from stats");
  expect(textOf(row)).toContain("Hidden from stats");
});
