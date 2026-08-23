import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTING } from "@/core/model";
import { DASHBOARD_WIDGETS } from "./registry";
import {
  DASHBOARD_DEFAULT_KEY,
  OVERVIEW_DASHBOARD_ID,
  applyDashboardLayout,
  dashboardItemKey,
  decodeDashboardDefinition,
  defaultDashboardDefinition,
  defaultDashboardLayout,
  encodeDashboardDefinition,
  type DashboardLayout,
} from "./dashboard-layout";
import { useDashboardLayout } from "./use-dashboard-layout";

const fixture = vi.hoisted(() => ({
  settings: [] as { key: string; value: string }[],
  legacyPref: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useMemo: <T>(factory: () => T) => factory(),
    useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
  };
});

vi.mock("jotai", () => ({
  useAtomValue: () => fixture.settings,
  useSetAtom: () => fixture.dispatch,
}));

vi.mock("@/features/store", () => ({
  settingsAtom: "settings",
  dispatchAtom: "legacy-dispatch",
  dispatchManyAtom: "dispatch-many",
}));

vi.mock("@/features/prefs", () => ({
  useLocalPref: fixture.legacyPref,
}));

const fallback = defaultDashboardLayout(DASHBOARD_WIDGETS);

function moveRecentBeforePace(layout: DashboardLayout): DashboardLayout {
  return {
    ...layout,
    order: [
      "balance",
      "recent",
      "pace",
      ...layout.order.filter((id) => !["balance", "recent", "pace"].includes(id)),
    ],
  };
}

function encodeLegacyLayout(layout: DashboardLayout): string {
  return JSON.stringify({ version: 1, ...layout });
}

function storedDashboard(layout: DashboardLayout) {
  return applyDashboardLayout(
    defaultDashboardDefinition(DASHBOARD_WIDGETS),
    layout,
    DASHBOARD_WIDGETS,
  );
}

describe("useDashboardLayout", () => {
  beforeEach(() => {
    fixture.settings = [];
    fixture.legacyPref
      .mockReset()
      .mockReturnValue([encodeLegacyLayout(moveRecentBeforePace(fallback)), vi.fn()]);
    fixture.dispatch.mockReset().mockResolvedValue(undefined);
  });

  it("reads the default dashboard from independent v2 settings", () => {
    const synced = moveRecentBeforePace(fallback);
    const dashboard = storedDashboard(synced);
    fixture.settings = [
      { key: DASHBOARD_DEFAULT_KEY, value: OVERVIEW_DASHBOARD_ID },
      {
        key: dashboardItemKey(OVERVIEW_DASHBOARD_ID),
        value: encodeDashboardDefinition(dashboard),
      },
    ];

    const [layout] = useDashboardLayout();

    expect(layout).toEqual(synced);
  });

  it("ignores synced and browser-local v1 layouts", () => {
    fixture.settings = [
      {
        key: SETTING.dashboardLayout,
        value: encodeLegacyLayout(moveRecentBeforePace(fallback)),
      },
    ];

    const [layout] = useDashboardLayout();

    expect(layout).toEqual(fallback);
    expect(fixture.legacyPref).not.toHaveBeenCalled();
  });

  it("saves only the active dashboard item and default", async () => {
    const next = moveRecentBeforePace(fallback);
    const overview = defaultDashboardDefinition(DASHBOARD_WIDGETS);
    const planning = {
      ...overview,
      id: "planning",
      name: "Planning",
      rank: 1,
    };
    fixture.settings = [
      { key: DASHBOARD_DEFAULT_KEY, value: OVERVIEW_DASHBOARD_ID },
      {
        key: dashboardItemKey(overview.id),
        value: encodeDashboardDefinition(overview),
      },
      {
        key: dashboardItemKey(planning.id),
        value: encodeDashboardDefinition(planning),
      },
    ];

    const [, setLayout] = useDashboardLayout();
    await setLayout(next);

    const ops = fixture.dispatch.mock.calls[0][0] as {
      type: string;
      payload: { row: { key: string; value: string } };
    }[];
    expect(ops.map((op) => op.type)).toEqual(["setting.set", "setting.set"]);
    expect(ops.map((op) => op.payload.row.key)).toEqual([
      dashboardItemKey(OVERVIEW_DASHBOARD_ID),
      DASHBOARD_DEFAULT_KEY,
    ]);
    expect(decodeDashboardDefinition(ops[0].payload.row.value)).toEqual(
      storedDashboard(next),
    );
    expect(ops[1].payload.row.value).toBe(OVERVIEW_DASHBOARD_ID);
  });

  it("preserves an unknown widget instance on save", async () => {
    const unknown = {
      instanceId: "future-1",
      widgetType: "future-widget",
      size: "compact" as const,
      hidden: false,
      settings: { future: true },
    };
    const dashboard = {
      ...defaultDashboardDefinition(DASHBOARD_WIDGETS),
      instances: [...defaultDashboardDefinition(DASHBOARD_WIDGETS).instances, unknown],
    };
    fixture.settings = [
      { key: DASHBOARD_DEFAULT_KEY, value: OVERVIEW_DASHBOARD_ID },
      {
        key: dashboardItemKey(OVERVIEW_DASHBOARD_ID),
        value: encodeDashboardDefinition(dashboard),
      },
    ];

    const [layout, setLayout] = useDashboardLayout();
    await setLayout(setWidgetHidden(layout, "pace"));

    const ops = fixture.dispatch.mock.calls[0][0] as {
      payload: { row: { key: string; value: string } };
    }[];
    const saved = decodeDashboardDefinition(ops[0].payload.row.value);
    expect(
      saved?.instances.find((instance) => instance.instanceId === unknown.instanceId),
    ).toEqual(unknown);
  });
});

function setWidgetHidden(layout: DashboardLayout, id: string): DashboardLayout {
  return { ...layout, hidden: [...layout.hidden, id] };
}
