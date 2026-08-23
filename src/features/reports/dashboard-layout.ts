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

function defaultInstance(widget: WidgetDef): DashboardWidgetInstance {
  return {
    instanceId: widget.id,
    widgetType: widget.id,
    size: "expanded",
    hidden: !widget.defaultVisible && widget.id !== PINNED_WIDGET_ID,
  };
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

function withNewRegistryWidgets(
  dashboard: DashboardDefinition,
  widgets: readonly WidgetDef[],
): DashboardDefinition {
  const existingTypes = new Set(
    dashboard.instances.map((instance) => instance.widgetType),
  );
  const additions = widgets
    .filter((widget) => !existingTypes.has(widget.id))
    .map(defaultInstance);
  return additions.length === 0
    ? dashboard
    : { ...dashboard, instances: [...dashboard.instances, ...additions] };
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
    dashboards.push(withNewRegistryWidgets(dashboard, widgets));
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

function managedInstance(
  instance: DashboardWidgetInstance,
  known: ReadonlySet<string>,
): boolean {
  return known.has(instance.widgetType) && instance.instanceId === instance.widgetType;
}

/** Temporary adapter for the current one-instance-per-widget editor. */
export function layoutFromDashboard(
  dashboard: DashboardDefinition,
  widgets: readonly WidgetDef[],
): DashboardLayout {
  const complete = withNewRegistryWidgets(dashboard, widgets);
  const known = new Set(widgets.map((widget) => widget.id));
  const instances = complete.instances.filter((instance) =>
    managedInstance(instance, known),
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
  const complete = withNewRegistryWidgets(dashboard, widgets);
  const known = new Set(widgets.map((widget) => widget.id));
  const managed = new Map(
    complete.instances
      .filter((instance) => managedInstance(instance, known))
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
  const instances = complete.instances.flatMap((instance) => {
    if (!managedInstance(instance, known)) return [instance];
    const replacement = reordered[nextManaged++];
    return replacement ? [replacement] : [];
  });
  instances.push(...reordered.slice(nextManaged));
  return { ...complete, instances };
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
