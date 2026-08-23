import { z } from "zod";
import type { Setting } from "@/core/model";
import type { WidgetDef } from "./registry";

export const PINNED_WIDGET_ID = "balance";
export const OVERVIEW_DASHBOARD_ID = "overview";
export const DASHBOARD_ITEM_PREFIX = "dashboard.v2.item.";
export const DASHBOARD_DEFAULT_KEY = "dashboard.v2.default";

export interface DashboardLayout {
  order: string[];
  hidden: string[];
}

const DashboardSubjectSchema = z
  .object({
    type: z.string().trim().min(1),
    id: z.string().trim().min(1),
  })
  .passthrough();

export const DashboardWidgetInstanceSchema = z
  .object({
    instanceId: z.string().trim().min(1),
    widgetType: z.string().trim().min(1),
    size: z.enum(["compact", "expanded"]),
    hidden: z.boolean(),
    subject: DashboardSubjectSchema.optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
export type DashboardWidgetInstance = z.infer<typeof DashboardWidgetInstanceSchema>;

export const DashboardDefinitionSchema = z
  .object({
    version: z.literal(2),
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    rank: z.number().int().safe(),
    isDeleted: z.boolean(),
    instances: z.array(DashboardWidgetInstanceSchema),
  })
  .passthrough()
  .superRefine((dashboard, ctx) => {
    const seen = new Set<string>();
    for (const [index, instance] of dashboard.instances.entries()) {
      if (seen.has(instance.instanceId)) {
        ctx.addIssue({
          code: "custom",
          message: "widget instance ids must be unique",
          path: ["instances", index, "instanceId"],
        });
      }
      seen.add(instance.instanceId);
    }
  });
export type DashboardDefinition = z.infer<typeof DashboardDefinitionSchema>;

export interface DashboardState {
  dashboards: DashboardDefinition[];
  defaultDashboardId: string;
}

export type DashboardStarter = "planning" | "trends" | "current" | "empty";

const STARTER_WIDGET_TYPES: Record<Exclude<DashboardStarter, "current">, string[]> = {
  planning: ["balance", "pace", "upcoming", "goals", "budgets"],
  trends: ["balance", "saved", "kpis", "monthly", "trend", "investments"],
  empty: ["balance"],
};

function defaultInstance(widget: WidgetDef): DashboardWidgetInstance {
  return {
    instanceId: widget.id,
    widgetType: widget.id,
    size: "expanded",
    hidden: !widget.defaultVisible && widget.id !== PINNED_WIDGET_ID,
  };
}

function withPinnedBalance(
  dashboard: DashboardDefinition,
  widgets: readonly WidgetDef[],
): DashboardDefinition {
  if (dashboard.instances.some((instance) => instance.widgetType === PINNED_WIDGET_ID)) {
    return dashboard;
  }
  const widget = widgets.find((candidate) => candidate.id === PINNED_WIDGET_ID);
  if (!widget) return dashboard;
  const instance = defaultInstance(widget);
  const usedIds = new Set(dashboard.instances.map((candidate) => candidate.instanceId));
  let suffix = 0;
  while (usedIds.has(instance.instanceId)) {
    suffix += 1;
    instance.instanceId = `${PINNED_WIDGET_ID}:${suffix}`;
  }
  return { ...dashboard, instances: [instance, ...dashboard.instances] };
}

export function defaultDashboardDefinition(
  widgets: readonly WidgetDef[],
): DashboardDefinition {
  return {
    version: 2,
    id: OVERVIEW_DASHBOARD_ID,
    name: "Overview",
    rank: 0,
    isDeleted: false,
    instances: widgets.map(defaultInstance),
  };
}

export function createDashboardDefinition({
  id,
  name,
  rank,
  starter,
  current,
  widgets,
  makeId,
}: {
  id: string;
  name: string;
  rank: number;
  starter: DashboardStarter;
  current: DashboardDefinition;
  widgets: readonly WidgetDef[];
  makeId: () => string;
}): DashboardDefinition {
  const byType = new Map(widgets.map((widget) => [widget.id, widget]));
  const source =
    starter === "current"
      ? current.instances
      : STARTER_WIDGET_TYPES[starter].flatMap((widgetType) => {
          const widget = byType.get(widgetType);
          return widget ? [{ ...defaultInstance(widget), hidden: false }] : [];
        });
  const draft = DashboardDefinitionSchema.parse({
    version: 2,
    id,
    name: name.trim(),
    rank,
    isDeleted: false,
    instances: source,
  });
  const pinned = withPinnedBalance(draft, widgets);
  return DashboardDefinitionSchema.parse({
    ...pinned,
    instances: pinned.instances.map((instance) => ({
      ...instance,
      instanceId: makeId(),
    })),
  });
}

export function renameDashboard(
  dashboard: DashboardDefinition,
  name: string,
): DashboardDefinition {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("dashboard name is required");
  return { ...dashboard, name: trimmed };
}

export function reorderDashboards(
  dashboards: readonly DashboardDefinition[],
  activeId: string,
  overId: string,
): DashboardDefinition[] {
  if (activeId === overId) return [...dashboards];
  const ordered = [...dashboards].sort(
    (a, b) => a.rank - b.rank || a.id.localeCompare(b.id),
  );
  const from = ordered.findIndex((dashboard) => dashboard.id === activeId);
  const to = ordered.findIndex((dashboard) => dashboard.id === overId);
  if (from < 0 || to < 0) return ordered;
  ordered.splice(to, 0, ordered.splice(from, 1)[0]);
  return ordered.map((dashboard, rank) => ({ ...dashboard, rank }));
}

export function tombstoneDashboard(
  dashboards: readonly DashboardDefinition[],
  id: string,
): DashboardDefinition {
  const active = dashboards.filter((dashboard) => !dashboard.isDeleted);
  if (active.length <= 1) throw new Error("cannot delete the last dashboard");
  const target = active.find((dashboard) => dashboard.id === id);
  if (!target) throw new Error("dashboard not found");
  return { ...target, isDeleted: true };
}

export function dashboardItemKey(id: string): string {
  if (!id.trim()) throw new Error("dashboard id is required");
  return `${DASHBOARD_ITEM_PREFIX}${id}`;
}

export function decodeDashboardDefinition(raw: string): DashboardDefinition | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = DashboardDefinitionSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function encodeDashboardDefinition(dashboard: DashboardDefinition): string {
  return JSON.stringify(DashboardDefinitionSchema.parse(dashboard));
}

/** Resolve active dashboard records from independent setting keys. */
export function resolveDashboardState(
  settings: readonly Setting[],
  widgets: readonly WidgetDef[],
): DashboardState {
  const dashboards: DashboardDefinition[] = [];
  for (const setting of settings) {
    if (!setting.key.startsWith(DASHBOARD_ITEM_PREFIX)) continue;
    const keyId = setting.key.slice(DASHBOARD_ITEM_PREFIX.length);
    if (!keyId) continue;
    const dashboard = decodeDashboardDefinition(setting.value);
    if (!dashboard || dashboard.id !== keyId || dashboard.isDeleted) continue;
    dashboards.push(withPinnedBalance(dashboard, widgets));
  }

  dashboards.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  if (dashboards.length === 0) {
    return {
      dashboards: [defaultDashboardDefinition(widgets)],
      defaultDashboardId: OVERVIEW_DASHBOARD_ID,
    };
  }

  const requestedDefault = settings.find(
    (setting) => setting.key === DASHBOARD_DEFAULT_KEY,
  )?.value;
  return {
    dashboards,
    defaultDashboardId: dashboards.some((dashboard) => dashboard.id === requestedDefault)
      ? requestedDefault!
      : dashboards[0].id,
  };
}

function managedInstanceIds(
  dashboard: DashboardDefinition,
  known: ReadonlySet<string>,
): ReadonlySet<string> {
  const byType = new Map<string, DashboardWidgetInstance[]>();
  for (const instance of dashboard.instances) {
    if (!known.has(instance.widgetType)) continue;
    const existing = byType.get(instance.widgetType) ?? [];
    existing.push(instance);
    byType.set(instance.widgetType, existing);
  }
  const managed = new Set<string>();
  for (const [widgetType, instances] of byType) {
    const instance =
      instances.find((candidate) => candidate.instanceId === widgetType) ??
      (instances.length === 1 ? instances[0] : null);
    if (instance) managed.add(instance.instanceId);
  }
  return managed;
}

/** Temporary adapter for the current one-instance-per-widget editor. */
export function layoutFromDashboard(
  dashboard: DashboardDefinition,
  widgets: readonly WidgetDef[],
): DashboardLayout {
  dashboard = withPinnedBalance(dashboard, widgets);
  const known = new Set(widgets.map((widget) => widget.id));
  const managed = managedInstanceIds(dashboard, known);
  const instances = dashboard.instances.filter((instance) =>
    managed.has(instance.instanceId),
  );
  const ids = instances.map((instance) => instance.widgetType);
  const order = ids.includes(PINNED_WIDGET_ID)
    ? [PINNED_WIDGET_ID, ...ids.filter((id) => id !== PINNED_WIDGET_ID)]
    : ids;
  return {
    order,
    hidden: instances
      .filter((instance) => instance.hidden && instance.widgetType !== PINNED_WIDGET_ID)
      .map((instance) => instance.widgetType),
  };
}

/** Apply current editor choices without dropping newer-client instances/config. */
export function applyDashboardLayout(
  dashboard: DashboardDefinition,
  layout: DashboardLayout,
  widgets: readonly WidgetDef[],
): DashboardDefinition {
  dashboard = withPinnedBalance(dashboard, widgets);
  const known = new Set(widgets.map((widget) => widget.id));
  const managedIds = managedInstanceIds(dashboard, known);
  const managed = new Map(
    dashboard.instances
      .filter((instance) => managedIds.has(instance.instanceId))
      .map((instance) => [instance.widgetType, instance]),
  );
  const hidden = new Set(layout.hidden);
  const reordered = layout.order.flatMap((id) => {
    const instance = managed.get(id);
    if (!instance) return [];
    return [
      {
        ...instance,
        hidden: id === PINNED_WIDGET_ID ? false : hidden.has(id),
      },
    ];
  });

  let nextManaged = 0;
  const instances = dashboard.instances.flatMap((instance) => {
    if (!managedIds.has(instance.instanceId)) return [instance];
    const replacement = reordered[nextManaged++];
    return replacement ? [replacement] : [];
  });
  instances.push(...reordered.slice(nextManaged));
  return { ...dashboard, instances };
}

export function defaultDashboardLayout(widgets: readonly WidgetDef[]): DashboardLayout {
  return layoutFromDashboard(defaultDashboardDefinition(widgets), widgets);
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
  return {
    ...layout,
    hidden: [
      ...layout.order.filter((candidate) => hidden.has(candidate)),
      ...[...hidden].filter((candidate) => !layout.order.includes(candidate)),
    ],
  };
}
