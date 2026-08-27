import { afterEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { WidgetContext, WidgetDef } from "./registry";
import { ShowMathSheet } from "./ShowMathSheet";
import { DashboardWidget } from "./WidgetShell";
import { createDashboardAggregates } from "./dashboard-aggregates";

const fixture = vi.hoisted(() => ({ open: "open" }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: <T,>(initialValue: T) => [initialValue, vi.fn()],
  };
});

vi.mock("@/features/prefs", () => ({
  useLocalPref: (key: string) =>
    key.includes(".open.") ? [fixture.open, vi.fn()] : ["global", vi.fn()],
}));

afterEach(() => {
  fixture.open = "open";
});

const base = {
  range: { start: "2026-08-01", end: "2026-08-31" },
  today: "2026-08-23",
  cravingWins: [],
  categories: [],
  containers: [],
  ledgerTransactions: [],
  reportTransactions: [],
  budgetTargets: [],
  snapshots: [],
  recurringRules: [],
  goals: [],
  aggregates: createDashboardAggregates({
    budgetTargets: [],
    categories: [],
    containers: [],
    ledgerTransactions: [],
    reportTransactions: [],
    recurringRules: [],
    snapshots: [],
    goals: [],
  }),
} satisfies WidgetContext;

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return textOf(node.props.children);
}

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

function render(def: WidgetDef, size: "compact" | "expanded" = "expanded") {
  return DashboardWidget({
    instanceId: "test-instance",
    size,
    def,
    base,
  });
}

it("gives Overall balance standard collapsible card chrome", () => {
  const def = {
    id: "balance",
    title: "Overall balance",
    description: "Current total.",
    defaultVisible: true,
    fixedWindow: true,
    render: () => <div>$42</div>,
  } as WidgetDef;

  const tree = render(def);

  expect(findComponent(tree, "Collapsible")).not.toBeNull();
  expect(textOf(tree)).toContain("Overall balance");
});

it("gives Overall balance the standard widget menu", () => {
  const hide = vi.fn();
  const def = {
    id: "balance",
    title: "Overall balance",
    description: "Current total.",
    defaultVisible: true,
    fixedWindow: true,
    render: () => <div>$42</div>,
  } as WidgetDef;

  const tree = DashboardWidget({
    instanceId: "balance",
    size: "expanded",
    def,
    base,
    onHide: hide,
  });
  const actions = findComponent(tree, "RowActions");
  const hideItem = findComponent(
    actions?.props.children as ReactNode,
    "DropdownMenuItem",
  );

  expect(actions?.props.label).toBe("Configure Overall balance");
  expect(textOf(actions?.props.children as ReactNode)).toContain("Hide widget");
  (hideItem?.props.onSelect as (() => void) | undefined)?.();
  expect(hide).toHaveBeenCalledOnce();
});

it("uses dedicated compact content instead of clipping expanded content", () => {
  const def = {
    id: "test",
    title: "Test forecast",
    description: "Test",
    defaultVisible: true,
    render: () => <div>Expanded ledger</div>,
    renderCompact: () => <div>Compact total $42</div>,
  } as WidgetDef;

  expect(textOf(render(def, "compact"))).toContain("Compact total $42");
  expect(textOf(render(def, "compact"))).not.toContain("Expanded ledger");
});

it("keeps an ineligible configured widget with a directed setup action", () => {
  const def = {
    id: "test",
    title: "Test forecast",
    description: "Test",
    defaultVisible: true,
    render: () => <div>Fabricated certainty</div>,
    availability: () => ({
      status: "needs-setup",
      title: "Add a recurring rule",
      description: "A dated rule unlocks this forecast.",
      action: { label: "Set up recurring", href: "/recurring" },
    }),
  } as WidgetDef;

  const text = textOf(render(def));
  expect(text).toContain("Add a recurring rule");
  expect(text).toContain("Set up recurring");
  expect(text).not.toContain("Fabricated certainty");
});

it("offers the reusable math surface when a widget discloses its inputs", () => {
  const def = {
    id: "test",
    title: "Test forecast",
    description: "Test",
    defaultVisible: true,
    render: () => <div>$42</div>,
    math: () => ({
      range: "Aug 23 – Sep 21, 2026",
      freshness: "Ledger current through Aug 23",
      lines: [{ kind: "scheduled", label: "Known bills", amount: -5800 }],
      exclusions: ["Investment containers"],
      rule: "Approved rows are actual; active rules are scheduled.",
    }),
  } as WidgetDef;

  const actions = findComponent(render(def), "RowActions");

  expect(actions?.props.label).toBe("Configure Test forecast");
  expect(textOf(actions?.props.children as ReactNode)).toContain("Show the math");
});

it("groups size and settings with math in the title menu", () => {
  const changeSize = vi.fn();
  const def = {
    id: "test",
    title: "Test forecast",
    description: "Test",
    defaultVisible: true,
    fixedWindow: true,
    render: () => <div>Expanded</div>,
    renderCompact: () => <div>Compact</div>,
    renderSettings: () => <div>Settings body</div>,
    math: () => ({
      range: "Aug 2026",
      freshness: "Current",
      lines: [],
      exclusions: [],
      rule: "Test rule",
    }),
  } as WidgetDef;

  const tree = DashboardWidget({
    instanceId: "test-instance",
    size: "expanded",
    def,
    base,
    onSizeChange: changeSize,
  });
  const actions = findComponent(tree, "RowActions");
  const menuText = textOf(actions?.props.children as ReactNode);
  const sizeGroup = findComponent(
    actions?.props.children as ReactNode,
    "DropdownMenuRadioGroup",
  );

  expect(actions?.props.label).toBe("Configure Test forecast");
  expect(menuText).toContain("Size");
  expect(menuText).toContain("Compact");
  expect(menuText).toContain("Expanded");
  expect(menuText).toContain("Settings");
  expect(menuText).toContain("Show the math");
  (sizeGroup?.props.onValueChange as ((value: string) => void) | undefined)?.("compact");
  expect(changeSize).toHaveBeenCalledWith("compact");
});

it("separates math inputs and always discloses freshness, exclusions, and rule", () => {
  const sheet = ShowMathSheet({
    open: true,
    onOpenChange: vi.fn(),
    title: "Test forecast",
    idPrefix: "test-instance",
    disclosure: {
      range: "Aug 23 – Sep 21, 2026",
      freshness: "Ledger current through Aug 23",
      lines: [
        { kind: "actual", label: "Opening cash", amount: 42000 },
        { kind: "scheduled", label: "Known bills", amount: -5800 },
        { kind: "inferred", label: "Flexible spending", amount: -2100 },
      ],
      exclusions: ["Investment containers"],
      rule: "Approved rows are actual; active rules are scheduled.",
    },
  });
  const text = textOf(sheet.props.children);

  expect(text).toContain("Actual");
  expect(text).toContain("Scheduled");
  expect(text).toContain("Inferred");
  expect(text).toContain("Ledger current through Aug 23");
  expect(text).toContain("Investment containers");
  expect(text).toContain("Approved rows are actual");
});

it("does no renderer or math work while a widget is folded", () => {
  fixture.open = "closed";
  const renderBody = vi.fn(() => <div>Heavy detail</div>);
  const deriveMath = vi.fn(() => ({
    range: "Aug 2026",
    freshness: "Current",
    lines: [],
    exclusions: [],
    rule: "Test rule",
  }));
  const def = {
    id: "test",
    title: "Test forecast",
    description: "Test",
    defaultVisible: true,
    render: renderBody,
    math: deriveMath,
  } as WidgetDef;

  render(def);

  expect(renderBody).not.toHaveBeenCalled();
  expect(deriveMath).not.toHaveBeenCalled();
});
