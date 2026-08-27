import { z } from "zod";
import type { Setting } from "@/core/model";
import type { WidgetDef } from "./registry";

export const OVERVIEW_DASHBOARD_ID = "overview";
export const DASHBOARD_ITEM_PREFIX = "dashboard.v2.item.";
export const DASHBOARD_DEFAULT_KEY = "dashboard.v2.default";

export interface DashboardLayout {
  order: string[];
  hidden: string[];
  sizes: Record<string, DashboardWidgetInstance["size"]>;
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

export interface DashboardWidgetEntry {
  instance: DashboardWidgetInstance;
  def: WidgetDef;
}

export type DashboardStarter = "planning" | "trends" | "current" | "empty";

export interface DashboardWidgetPreset {
  widgetType: string;
  size: DashboardWidgetInstance["size"];
}

export interface OverviewEligibility {
  hasExpenseBudget: boolean;
  hasRecurringSchedule: boolean;
  hasScheduledIncome: boolean;
  hasActiveGoal: boolean;
  hasLandingHistory: boolean;
  hasLandingSignal: boolean;
  hasCravingWins: boolean;
}

const STARTER_WIDGETS: Record<
  Exclude<DashboardStarter, "current">,
  DashboardWidgetPreset[]
> = {
  planning: [
    { widgetType: "balance", size: "expanded" },
    { widgetType: "allocation", size: "compact" },
    { widgetType: "commitments", size: "expanded" },
    { widgetType: "upcoming", size: "expanded" },
    { widgetType: "goals", size: "compact" },
  ],
  trends: [
    { widgetType: "balance", size: "expanded" },
    { widgetType: "saved", size: "compact" },
    { widgetType: "landing", size: "expanded" },
    { widgetType: "resilience", size: "compact" },
  ],
  empty: [{ widgetType: "balance", size: "expanded" }],
};

export function curatedOverviewWidgets(
  eligibility: OverviewEligibility,
): DashboardWidgetPreset[] {
  return [
    { widgetType: "balance", size: "expanded" },
    {
      widgetType: "brief",
      size: eligibility.hasExpenseBudget ? "compact" : "expanded",
    },
    ...(eligibility.hasExpenseBudget
      ? [{ widgetType: "pace", size: "compact" as const }]
      : []),
    eligibility.hasRecurringSchedule
      ? { widgetType: "upcoming", size: "expanded" }
      : { widgetType: "recent", size: "expanded" },
    ...(eligibility.hasScheduledIncome &&
    (eligibility.hasExpenseBudget || eligibility.hasActiveGoal)
      ? [
          {
            widgetType: "allocation",
            size: eligibility.hasActiveGoal
              ? ("compact" as const)
              : ("expanded" as const),
          },
        ]
      : []),
    ...(eligibility.hasActiveGoal
      ? [{ widgetType: "goals", size: "compact" as const }]
      : []),
    ...(eligibility.hasLandingHistory && eligibility.hasLandingSignal
      ? [{ widgetType: "landing", size: "expanded" as const }]
      : []),
    ...(eligibility.hasCravingWins
      ? [{ widgetType: "cravings", size: "compact" as const }]
      : []),
  ];
}

function defaultInstance(widget: WidgetDef): DashboardWidgetInstance {
  return {
    instanceId: widget.id,
    widgetType: widget.id,
    size: "expanded",
    hidden: !widget.defaultVisible,
  };
}

export function defaultDashboardDefinition(
  widgets: readonly WidgetDef[],
  curation?: readonly DashboardWidgetPreset[],
): DashboardDefinition {
  const available = widgets.filter((widget) => !widget.gallery?.repeatable);
  const byType = new Map(available.map((widget) => [widget.id, widget]));
  const curatedTypes = new Set<string>();
  const curated = (curation ?? []).flatMap((preset) => {
    const widget = byType.get(preset.widgetType);
    if (!widget || curatedTypes.has(widget.id)) return [];
    curatedTypes.add(widget.id);
    return [{ ...defaultInstance(widget), size: preset.size, hidden: false }];
  });
  return {
    version: 2,
    id: OVERVIEW_DASHBOARD_ID,
    name: "Overview",
    rank: 0,
    isDeleted: false,
    instances: curation
      ? [
          ...curated,
          ...available
            .filter((widget) => !curatedTypes.has(widget.id))
            .map((widget) => ({ ...defaultInstance(widget), hidden: true })),
        ]
      : available.map(defaultInstance),
  };
}

export function addDashboardWidgetInstance(
  dashboard: DashboardDefinition,
  widgetType: string,
  configuration: {
    size?: DashboardWidgetInstance["size"];
    subject?: DashboardWidgetInstance["subject"];
    settings?: DashboardWidgetInstance["settings"];
  },
  makeId: () => string,
): DashboardDefinition {
  const used = new Set(dashboard.instances.map((instance) => instance.instanceId));
  let instanceId = "";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = makeId().trim();
    if (candidate && !used.has(candidate)) {
      instanceId = candidate;
      break;
    }
  }
  if (!instanceId) throw new Error("could not create a unique widget instance id");

  const instance = DashboardWidgetInstanceSchema.parse({
    instanceId,
    widgetType,
    size: configuration.size ?? "expanded",
    hidden: false,
    ...(configuration.subject ? { subject: configuration.subject } : {}),
    ...(configuration.settings ? { settings: configuration.settings } : {}),
  });
  return DashboardDefinitionSchema.parse({
    ...dashboard,
    instances: [...dashboard.instances, instance],
  });
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
      : STARTER_WIDGETS[starter].flatMap((preset) => {
          const widget = byType.get(preset.widgetType);
          return widget
            ? [{ ...defaultInstance(widget), size: preset.size, hidden: false }]
            : [];
        });
  const draft = DashboardDefinitionSchema.parse({
    version: 2,
    id,
    name: name.trim(),
    rank,
    isDeleted: false,
    instances: source,
  });
  return DashboardDefinitionSchema.parse({
    ...draft,
    instances: draft.instances.map((instance) => ({
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
  curation?: readonly DashboardWidgetPreset[],
): DashboardState {
  const dashboards: DashboardDefinition[] = [];
  for (const setting of settings) {
    if (!setting.key.startsWith(DASHBOARD_ITEM_PREFIX)) continue;
    const keyId = setting.key.slice(DASHBOARD_ITEM_PREFIX.length);
    if (!keyId) continue;
    const dashboard = decodeDashboardDefinition(setting.value);
    if (!dashboard || dashboard.id !== keyId || dashboard.isDeleted) continue;
    dashboards.push(dashboard);
  }

  dashboards.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  if (dashboards.length === 0) {
    return {
      dashboards: [defaultDashboardDefinition(widgets, curation)],
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

/** Resolve the editable instances known to this client without erasing others. */
export function layoutFromDashboard(
  dashboard: DashboardDefinition,
  widgets: readonly WidgetDef[],
): DashboardLayout {
  const known = new Set(widgets.map((widget) => widget.id));
  const instances = dashboard.instances.filter((instance) =>
    known.has(instance.widgetType),
  );
  return {
    order: instances.map((instance) => instance.instanceId),
    hidden: instances
      .filter((instance) => instance.hidden)
      .map((instance) => instance.instanceId),
    sizes: Object.fromEntries(
      instances.map((instance) => [instance.instanceId, instance.size]),
    ),
  };
}

/** Apply current editor choices without dropping newer-client instances/config. */
export function applyDashboardLayout(
  dashboard: DashboardDefinition,
  layout: DashboardLayout,
  widgets: readonly WidgetDef[],
): DashboardDefinition {
  const known = new Set(widgets.map((widget) => widget.id));
  const managed = new Map(
    dashboard.instances
      .filter((instance) => known.has(instance.widgetType))
      .map((instance) => [instance.instanceId, instance]),
  );
  const hidden = new Set(layout.hidden);
  const reordered = layout.order.flatMap((id) => {
    const instance = managed.get(id);
    if (!instance) return [];
    return [
      {
        ...instance,
        hidden: hidden.has(id),
        size: layout.sizes[id] ?? instance.size,
      },
    ];
  });

  let nextManaged = 0;
  const instances = dashboard.instances.flatMap((instance) => {
    if (!managed.has(instance.instanceId)) return [instance];
    const replacement = reordered[nextManaged++];
    return replacement ? [replacement] : [];
  });
  instances.push(...reordered.slice(nextManaged));
  return { ...dashboard, instances };
}

export function defaultDashboardLayout(widgets: readonly WidgetDef[]): DashboardLayout {
  return layoutFromDashboard(defaultDashboardDefinition(widgets), widgets);
}

export function resetDashboardLayout(
  dashboard: DashboardDefinition,
  widgets: readonly WidgetDef[],
  curation: readonly DashboardWidgetPreset[],
): DashboardLayout {
  const knownTypes = new Set(widgets.map((widget) => widget.id));
  const registryRank = new Map(widgets.map((widget, index) => [widget.id, index]));
  const curatedRank = new Map(
    curation.map((preset, index) => [preset.widgetType, index]),
  );
  const curatedSize = new Map(curation.map((preset) => [preset.widgetType, preset.size]));
  const instances = dashboard.instances
    .filter((instance) => knownTypes.has(instance.widgetType))
    .sort((a, b) => {
      const aCurated = curatedRank.get(a.widgetType);
      const bCurated = curatedRank.get(b.widgetType);
      if (aCurated !== undefined || bCurated !== undefined) {
        if (aCurated === undefined) return 1;
        if (bCurated === undefined) return -1;
        return aCurated - bCurated;
      }
      return (
        (registryRank.get(a.widgetType) ?? Number.MAX_SAFE_INTEGER) -
          (registryRank.get(b.widgetType) ?? Number.MAX_SAFE_INTEGER) ||
        a.instanceId.localeCompare(b.instanceId)
      );
    });
  const visibleTypes = new Set(curation.map((preset) => preset.widgetType));
  return {
    order: instances.map((instance) => instance.instanceId),
    hidden: instances
      .filter((instance) => !visibleTypes.has(instance.widgetType))
      .map((instance) => instance.instanceId),
    sizes: Object.fromEntries(
      instances.map((instance) => [
        instance.instanceId,
        curatedSize.get(instance.widgetType) ?? "expanded",
      ]),
    ),
  };
}

export function dashboardWidgetEntries(
  dashboard: DashboardDefinition,
  layout: DashboardLayout,
  widgets: readonly WidgetDef[],
): DashboardWidgetEntry[] {
  const byInstance = new Map(
    dashboard.instances.map((instance) => [instance.instanceId, instance]),
  );
  const byType = new Map(widgets.map((widget) => [widget.id, widget]));
  return layout.order.flatMap((instanceId) => {
    const instance = byInstance.get(instanceId);
    const def = instance ? byType.get(instance.widgetType) : null;
    return instance && def ? [{ instance, def }] : [];
  });
}

export function reorderDashboardLayout(
  layout: DashboardLayout,
  activeId: string,
  overId: string,
): DashboardLayout {
  if (activeId === overId) return layout;

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

export function setWidgetSize(
  layout: DashboardLayout,
  id: string,
  size: DashboardWidgetInstance["size"],
): DashboardLayout {
  if (!layout.order.includes(id)) return layout;
  return { ...layout, sizes: { ...layout.sizes, [id]: size } };
}
