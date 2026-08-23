import { describe, expect, it } from "vitest";
import { SETTING, type Setting } from "@/core/model";
import type { WidgetDef } from "./registry";
import {
  DASHBOARD_DEFAULT_KEY,
  DASHBOARD_ITEM_PREFIX,
  OVERVIEW_DASHBOARD_ID,
  applyDashboardLayout,
  dashboardItemKey,
  decodeDashboardDefinition,
  defaultDashboardDefinition,
  defaultDashboardLayout,
  encodeDashboardDefinition,
  layoutFromDashboard,
  reorderDashboardLayout,
  resolveDashboardState,
  setWidgetVisible,
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
  });
});
