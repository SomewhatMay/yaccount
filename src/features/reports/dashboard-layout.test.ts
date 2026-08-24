import { describe, expect, it } from "vitest";
import { SETTING, type Setting } from "@/core/model";
import type { WidgetDef } from "./registry";
import {
  addDashboardWidgetInstance,
  DASHBOARD_DEFAULT_KEY,
  DASHBOARD_ITEM_PREFIX,
  OVERVIEW_DASHBOARD_ID,
  applyDashboardLayout,
  createDashboardDefinition,
  curatedOverviewWidgets,
  dashboardItemKey,
  decodeDashboardDefinition,
  defaultDashboardDefinition,
  defaultDashboardLayout,
  encodeDashboardDefinition,
  layoutFromDashboard,
  renameDashboard,
  resetDashboardLayout,
  reorderDashboardLayout,
  reorderDashboards,
  resolveDashboardState,
  setWidgetVisible,
  setWidgetSize,
  tombstoneDashboard,
  type DashboardDefinition,
  type DashboardLayout,
} from "./dashboard-layout";

function defs(...ids: string[]): WidgetDef[] {
  return ids.map((id) => ({
    id,
    title: id,
    description: id,
    defaultVisible: id !== "later",
    render: () => null,
  }));
}

const widgets = defs("balance", "pace", "recent", "later");

function setting(key: string, value: string): Setting {
  return { key, value };
}

function encodeLegacyLayout(layout: DashboardLayout): string {
  return JSON.stringify({ version: 1, ...layout });
}

describe("dashboard layout v2", () => {
  it("builds one deterministic Overview with configured widget instances", () => {
    expect(defaultDashboardDefinition(widgets)).toEqual({
      version: 2,
      id: OVERVIEW_DASHBOARD_ID,
      name: "Overview",
      rank: 0,
      isDeleted: false,
      instances: [
        {
          instanceId: "balance",
          widgetType: "balance",
          size: "expanded",
          hidden: false,
        },
        {
          instanceId: "pace",
          widgetType: "pace",
          size: "expanded",
          hidden: false,
        },
        {
          instanceId: "recent",
          widgetType: "recent",
          size: "expanded",
          hidden: false,
        },
        {
          instanceId: "later",
          widgetType: "later",
          size: "expanded",
          hidden: true,
        },
      ],
    });
  });

  it("orders a curated Overview first and keeps every optional widget hidden", () => {
    const curated = curatedOverviewWidgets({
      hasExpenseBudget: true,
      hasRecurringSchedule: true,
      hasScheduledIncome: true,
      hasActiveGoal: true,
      hasLandingHistory: true,
      hasLandingSignal: true,
    });
    const definitions = defs(
      "balance",
      "brief",
      "pace",
      "recent",
      "saved",
      "upcoming",
      "allocation",
      "goals",
      "landing",
      "later",
    );
    const dashboard = defaultDashboardDefinition(definitions, curated);

    expect(
      dashboard.instances
        .slice(0, curated.length)
        .map((instance) => [instance.widgetType, instance.size, instance.hidden]),
    ).toEqual([
      ["balance", "expanded", false],
      ["brief", "compact", false],
      ["pace", "compact", false],
      ["upcoming", "expanded", false],
      ["allocation", "compact", false],
      ["goals", "compact", false],
      ["landing", "expanded", false],
    ]);
    expect(
      dashboard.instances
        .slice(curated.length)
        .map((instance) => [instance.widgetType, instance.hidden]),
    ).toEqual([
      ["recent", true],
      ["saved", true],
      ["later", true],
    ]);
  });

  it("falls back to Recent entries and waits for complete landing history", () => {
    expect(
      curatedOverviewWidgets({
        hasExpenseBudget: false,
        hasRecurringSchedule: false,
        hasScheduledIncome: false,
        hasActiveGoal: false,
        hasLandingHistory: false,
        hasLandingSignal: true,
      }),
    ).toEqual([
      { widgetType: "balance", size: "expanded" },
      { widgetType: "brief", size: "expanded" },
      { widgetType: "recent", size: "expanded" },
    ]);
  });

  it("expands Allocation plan when Goal outlook cannot complete its pair", () => {
    expect(
      curatedOverviewWidgets({
        hasExpenseBudget: true,
        hasRecurringSchedule: true,
        hasScheduledIncome: true,
        hasActiveGoal: false,
        hasLandingHistory: false,
        hasLandingSignal: false,
      }),
    ).toContainEqual({ widgetType: "allocation", size: "expanded" });
  });

  it("round-trips subjects, settings, and unknown widget types", () => {
    const dashboard: DashboardDefinition = {
      ...defaultDashboardDefinition(widgets),
      instances: [
        ...defaultDashboardDefinition(widgets).instances,
        {
          instanceId: "future-1",
          widgetType: "future-widget",
          size: "compact",
          hidden: true,
          subject: { type: "category", id: "groceries" },
          settings: { horizonDays: 45, showRange: true },
        },
      ],
    };

    expect(decodeDashboardDefinition(encodeDashboardDefinition(dashboard))).toEqual(
      dashboard,
    );
  });

  it("rejects malformed, unsupported, mismatched, and duplicate-instance records", () => {
    expect(decodeDashboardDefinition("nope")).toBeNull();
    expect(
      decodeDashboardDefinition(
        JSON.stringify({ ...defaultDashboardDefinition(widgets), version: 3 }),
      ),
    ).toBeNull();
    expect(
      decodeDashboardDefinition(
        JSON.stringify({
          ...defaultDashboardDefinition(widgets),
          instances: [
            defaultDashboardDefinition(widgets).instances[0],
            defaultDashboardDefinition(widgets).instances[0],
          ],
        }),
      ),
    ).toBeNull();
    expect(
      resolveDashboardState(
        [
          setting(
            dashboardItemKey("wrong-key"),
            encodeDashboardDefinition(defaultDashboardDefinition(widgets)),
          ),
        ],
        widgets,
      ).dashboards,
    ).toEqual([defaultDashboardDefinition(widgets)]);
  });

  it("derives dashboards only from valid item keys and resolves the synced default", () => {
    const overview = defaultDashboardDefinition(widgets);
    const planning = { ...overview, id: "planning", name: "Planning", rank: 1 };
    const state = resolveDashboardState(
      [
        setting(DASHBOARD_DEFAULT_KEY, "planning"),
        setting(dashboardItemKey(overview.id), encodeDashboardDefinition(overview)),
        setting(dashboardItemKey(planning.id), encodeDashboardDefinition(planning)),
        setting(DASHBOARD_ITEM_PREFIX, encodeDashboardDefinition(overview)),
        setting("dashboard.v2.metadata", encodeDashboardDefinition(overview)),
      ],
      widgets,
    );

    expect(state.dashboards.map((dashboard) => dashboard.id)).toEqual([
      "overview",
      "planning",
    ]);
    expect(state.defaultDashboardId).toBe("planning");
  });

  it("replaces v1 preferences and leaves their setting untouched", () => {
    const legacy = encodeLegacyLayout({
      order: ["balance", "recent", "pace", "later"],
      hidden: ["pace", "later"],
      sizes: {},
    });
    const settings = [setting(SETTING.dashboardLayout, legacy)];

    expect(resolveDashboardState(settings, widgets)).toEqual({
      dashboards: [defaultDashboardDefinition(widgets)],
      defaultDashboardId: OVERVIEW_DASHBOARD_ID,
    });
    expect(settings).toEqual([setting(SETTING.dashboardLayout, legacy)]);
  });

  it("ignores tombstones and resolves a deterministic active fallback", () => {
    const deleted = { ...defaultDashboardDefinition(widgets), isDeleted: true };
    const state = resolveDashboardState(
      [
        setting(DASHBOARD_DEFAULT_KEY, deleted.id),
        setting(dashboardItemKey(deleted.id), encodeDashboardDefinition(deleted)),
      ],
      widgets,
    );

    expect(state).toEqual({
      dashboards: [defaultDashboardDefinition(widgets)],
      defaultDashboardId: OVERVIEW_DASHBOARD_ID,
    });
  });

  it("repairs a missing pinned balance without adding other widgets", () => {
    const planning = {
      ...defaultDashboardDefinition(widgets),
      id: "planning",
      name: "Planning",
      instances: [defaultDashboardDefinition(widgets).instances[1]],
    };

    const state = resolveDashboardState(
      [setting(dashboardItemKey(planning.id), encodeDashboardDefinition(planning))],
      widgets,
    );

    expect(state.dashboards[0].instances.map((instance) => instance.widgetType)).toEqual([
      "balance",
      "pace",
    ]);
  });

  it("preserves unknown instances when the current layout is edited", () => {
    const unknown = {
      instanceId: "future-1",
      widgetType: "future-widget",
      size: "compact" as const,
      hidden: false,
      subject: { type: "future-subject", id: "subject-1" },
      settings: { nested: { future: true } },
    };
    const dashboard = {
      ...defaultDashboardDefinition(widgets),
      instances: [
        defaultDashboardDefinition(widgets).instances[0],
        unknown,
        ...defaultDashboardDefinition(widgets).instances.slice(1),
      ],
    };
    const layout = layoutFromDashboard(dashboard, widgets);
    const edited = setWidgetVisible(
      reorderDashboardLayout(layout, "recent", "pace"),
      "pace",
      false,
    );
    const updated = applyDashboardLayout(dashboard, edited, widgets);

    expect(
      updated.instances.find((instance) => instance.instanceId === unknown.instanceId),
    ).toEqual(unknown);
    expect(layoutFromDashboard(updated, widgets)).toEqual(edited);
  });
});

describe("dashboard layout editing", () => {
  it("starts in registry order and respects default visibility", () => {
    expect(defaultDashboardLayout(widgets)).toEqual({
      order: ["balance", "pace", "recent", "later"],
      hidden: ["later"],
      sizes: {
        balance: "expanded",
        pace: "expanded",
        recent: "expanded",
        later: "expanded",
      },
    });
  });

  it("pins balance while reordering and changing visibility", () => {
    const initial = defaultDashboardLayout(widgets);
    expect(reorderDashboardLayout(initial, "recent", "pace")).toEqual({
      ...initial,
      order: ["balance", "recent", "pace", "later"],
    });
    expect(reorderDashboardLayout(initial, "balance", "recent")).toBe(initial);
    expect(setWidgetVisible(initial, "pace", false).hidden).toEqual(["pace", "later"]);
    expect(setWidgetVisible(initial, "later", true).hidden).toEqual([]);
    expect(setWidgetVisible(initial, "balance", false)).toBe(initial);
    expect(setWidgetSize(initial, "pace", "compact").sizes.pace).toBe("compact");
    expect(setWidgetSize(initial, "balance", "compact")).toBe(initial);
  });

  it("resets an edited dashboard to the same curated order, visibility, and sizes", () => {
    const definitions = defs("balance", "brief", "pace", "recent", "saved", "upcoming");
    const dashboard = defaultDashboardDefinition(definitions);
    const curation = curatedOverviewWidgets({
      hasExpenseBudget: false,
      hasRecurringSchedule: false,
      hasScheduledIncome: false,
      hasActiveGoal: false,
      hasLandingHistory: false,
      hasLandingSignal: false,
    });

    expect(resetDashboardLayout(dashboard, definitions, curation)).toEqual({
      order: ["balance", "brief", "recent", "pace", "saved", "upcoming"],
      hidden: ["pace", "saved", "upcoming"],
      sizes: {
        balance: "expanded",
        brief: "expanded",
        recent: "expanded",
        pace: "expanded",
        saved: "expanded",
        upcoming: "expanded",
      },
    });
  });
});

describe("configured widget instances", () => {
  it("does not seed repeatable widgets before their subject is configured", () => {
    const watch = {
      ...defs("watch-container")[0],
      gallery: {
        group: "watch" as const,
        terms: ["account"],
        repeatable: true,
        subject: "container" as const,
      },
    };

    expect(
      defaultDashboardDefinition([...widgets, watch]).instances.map(
        (instance) => instance.widgetType,
      ),
    ).not.toContain("watch-container");
  });

  it("appends repeatable instances with stable unique subjects and settings", () => {
    const dashboard = defaultDashboardDefinition(widgets);
    const ids = ["balance", "watch-2"];

    const next = addDashboardWidgetInstance(
      dashboard,
      "watch-container",
      {
        size: "compact",
        subject: { type: "container", id: "general" },
        settings: { floor: 25000 },
      },
      () => ids.shift()!,
    );

    expect(next.instances.at(-1)).toEqual({
      instanceId: "watch-2",
      widgetType: "watch-container",
      size: "compact",
      hidden: false,
      subject: { type: "container", id: "general" },
      settings: { floor: 25000 },
    });
    expect(dashboard.instances).toHaveLength(4);
  });
});

describe("dashboard set lifecycle", () => {
  const ids = [
    "dashboard-instance-1",
    "dashboard-instance-2",
    "dashboard-instance-3",
    "dashboard-instance-4",
    "dashboard-instance-5",
  ];

  it("creates a named dashboard from a curated starter", () => {
    const starterWidgets = defs(
      "balance",
      "allocation",
      "commitments",
      "upcoming",
      "goals",
      "saved",
      "landing",
      "resilience",
    );
    let index = 0;
    const dashboard = createDashboardDefinition({
      id: "quarterly",
      name: "  Quarterly planning  ",
      rank: 2,
      starter: "planning",
      current: defaultDashboardDefinition(starterWidgets),
      widgets: starterWidgets,
      makeId: () => ids[index++],
    });

    expect(dashboard).toMatchObject({
      version: 2,
      id: "quarterly",
      name: "Quarterly planning",
      rank: 2,
      isDeleted: false,
    });
    expect(dashboard.instances.map((instance) => instance.widgetType)).toEqual([
      "balance",
      "allocation",
      "commitments",
      "upcoming",
      "goals",
    ]);
    expect(dashboard.instances.map((instance) => instance.instanceId)).toEqual(ids);
    expect(dashboard.instances.map((instance) => instance.size)).toEqual([
      "expanded",
      "compact",
      "expanded",
      "expanded",
      "compact",
    ]);
  });

  it("creates the Trends starter from the replacement widgets", () => {
    const starterWidgets = defs("balance", "saved", "landing", "resilience", "monthly");
    let index = 0;
    const instanceIds = ["trend-1", "trend-2", "trend-3", "trend-4"];

    const dashboard = createDashboardDefinition({
      id: "trends",
      name: "Trends",
      rank: 2,
      starter: "trends",
      current: defaultDashboardDefinition(starterWidgets),
      widgets: starterWidgets,
      makeId: () => instanceIds[index++],
    });

    expect(dashboard.instances.map((instance) => instance.widgetType)).toEqual([
      "balance",
      "saved",
      "landing",
      "resilience",
    ]);
  });

  it("duplicates current configuration with fresh instance ids", () => {
    const source: DashboardDefinition = {
      ...defaultDashboardDefinition(widgets),
      instances: [
        {
          instanceId: "pace-custom",
          widgetType: "pace",
          size: "compact",
          hidden: true,
          settings: { horizon: 45 },
        },
        {
          instanceId: "future-custom",
          widgetType: "future-widget",
          size: "expanded",
          hidden: false,
          subject: { type: "container", id: "general" },
        },
      ],
    };
    let index = 0;
    const duplicate = createDashboardDefinition({
      id: "overview-copy",
      name: "Overview copy",
      rank: 1,
      starter: "current",
      current: source,
      widgets,
      makeId: () => ids[index++],
    });

    expect(duplicate.instances).toEqual([
      {
        instanceId: ids[0],
        widgetType: "balance",
        size: "expanded",
        hidden: false,
      },
      { ...source.instances[0], instanceId: ids[1] },
      { ...source.instances[1], instanceId: ids[2] },
    ]);
    expect(layoutFromDashboard(duplicate, widgets)).toEqual({
      order: [ids[0], ids[1]],
      hidden: [ids[1]],
      sizes: { [ids[0]]: "expanded", [ids[1]]: "compact" },
    });
  });

  it("renames, reorders, and tombstones without mutating siblings", () => {
    const overview = defaultDashboardDefinition(widgets);
    const planning = { ...overview, id: "planning", name: "Planning", rank: 1 };
    const trends = { ...overview, id: "trends", name: "Trends", rank: 2 };

    expect(renameDashboard(planning, "  Quarter plan ").name).toBe("Quarter plan");
    expect(() => renameDashboard(planning, "   ")).toThrow("dashboard name");
    expect(
      reorderDashboards([overview, planning, trends], "trends", "overview").map(
        (dashboard) => [dashboard.id, dashboard.rank],
      ),
    ).toEqual([
      ["trends", 0],
      ["overview", 1],
      ["planning", 2],
    ]);
    expect(tombstoneDashboard([overview, planning], planning.id)).toEqual({
      ...planning,
      isDeleted: true,
    });
    expect(() => tombstoneDashboard([overview], overview.id)).toThrow("last dashboard");
  });
});
