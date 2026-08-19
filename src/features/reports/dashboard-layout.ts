import type { WidgetDef } from "./registry";

export const DASHBOARD_LAYOUT_KEY = "yaccount.dashboard.layout";
export const PINNED_WIDGET_ID = "balance";

export interface DashboardLayout {
  order: string[];
  hidden: string[];
}

interface StoredDashboardLayout extends DashboardLayout {
  version: 1;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function defaultDashboardLayout(widgets: readonly WidgetDef[]): DashboardLayout {
  const ids = widgets.map((widget) => widget.id);
  return {
    order: ids.includes(PINNED_WIDGET_ID)
      ? [PINNED_WIDGET_ID, ...ids.filter((id) => id !== PINNED_WIDGET_ID)]
      : ids,
    hidden: widgets
      .filter((widget) => !widget.defaultVisible && widget.id !== PINNED_WIDGET_ID)
      .map((widget) => widget.id),
  };
}

function decodeDashboardLayout(raw: string): StoredDashboardLayout | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== "object" ||
      value === null ||
      !("version" in value) ||
      value.version !== 1 ||
      !("order" in value) ||
      !Array.isArray(value.order) ||
      !value.order.every((id) => typeof id === "string") ||
      !("hidden" in value) ||
      !Array.isArray(value.hidden) ||
      !value.hidden.every((id) => typeof id === "string")
    ) {
      return null;
    }
    return value as StoredDashboardLayout;
  } catch {
    return null;
  }
}

export function isDashboardLayoutPref(value: string): value is string {
  return decodeDashboardLayout(value) !== null;
}

export function encodeDashboardLayout(layout: DashboardLayout): string {
  return JSON.stringify({ version: 1, order: layout.order, hidden: layout.hidden });
}

export function resolveDashboardLayout(
  raw: string,
  widgets: readonly WidgetDef[],
): DashboardLayout {
  const stored = decodeDashboardLayout(raw);
  if (!stored) return defaultDashboardLayout(widgets);

  const known = new Set(widgets.map((widget) => widget.id));
  const storedOrder = unique(stored.order).filter((id) => known.has(id));
  const missing = widgets
    .map((widget) => widget.id)
    .filter((id) => !storedOrder.includes(id));
  const newlyHidden = widgets
    .filter((widget) => missing.includes(widget.id) && !widget.defaultVisible)
    .map((widget) => widget.id);
  const movableOrder = [...storedOrder, ...missing].filter(
    (id) => id !== PINNED_WIDGET_ID,
  );

  return {
    order: known.has(PINNED_WIDGET_ID)
      ? [PINNED_WIDGET_ID, ...movableOrder]
      : movableOrder,
    hidden: unique([...stored.hidden, ...newlyHidden]).filter(
      (id) => known.has(id) && id !== PINNED_WIDGET_ID,
    ),
  };
}

export function reorderDashboardLayout(
  layout: DashboardLayout,
  activeId: string,
  overId: string,
): DashboardLayout {
  if (
    activeId === PINNED_WIDGET_ID ||
    overId === PINNED_WIDGET_ID ||
    activeId === overId
  ) {
    return layout;
  }

  const from = layout.order.indexOf(activeId);
  const to = layout.order.indexOf(overId);
  if (from < 0 || to < 0) return layout;

  const order = [...layout.order];
  order.splice(to, 0, order.splice(from, 1)[0]);
  return { ...layout, order };
}

export function setWidgetVisible(
  layout: DashboardLayout,
  id: string,
  visible: boolean,
): DashboardLayout {
  if (id === PINNED_WIDGET_ID) return layout;
  const hidden = new Set(layout.hidden);
  if (visible) hidden.delete(id);
  else hidden.add(id);
  return { ...layout, hidden: [...hidden] };
}
