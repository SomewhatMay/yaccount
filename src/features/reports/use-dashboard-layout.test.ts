import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTING } from "@/core/model";
import { DASHBOARD_WIDGETS } from "./registry";
import {
  DASHBOARD_DEFAULT_KEY,
  OVERVIEW_DASHBOARD_ID,
  addDashboardWidgetInstance,
  applyDashboardLayout,
  dashboardItemKey,
  decodeDashboardDefinition,
  defaultDashboardDefinition,
  defaultDashboardLayout,
  encodeDashboardDefinition,
  type DashboardDefinition,
  type DashboardLayout,
} from "./dashboard-layout";
import { useDashboardSets } from "./use-dashboard-layout";

const fixture = vi.hoisted(() => ({
  settings: [] as { key: string; value: string }[],
  activeId: "",
  setActive: vi.fn(),
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
  dispatchManyAtom: "dispatch-many",
}));

vi.mock("@/features/prefs", () => ({
  useLocalPref: () => [fixture.activeId, fixture.setActive],
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

function storedDashboard(
  layout: DashboardLayout,
  fields: Partial<DashboardDefinition> = {},
): DashboardDefinition {
  return {
    ...applyDashboardLayout(
      defaultDashboardDefinition(DASHBOARD_WIDGETS),
      layout,
      DASHBOARD_WIDGETS,
    ),
    ...fields,
  };
}

function settingsFor(...dashboards: DashboardDefinition[]) {
  return [
    { key: DASHBOARD_DEFAULT_KEY, value: dashboards[0].id },
    ...dashboards.map((dashboard) => ({
      key: dashboardItemKey(dashboard.id),
      value: encodeDashboardDefinition(dashboard),
    })),
  ];
}

function dispatchedOps() {
  return fixture.dispatch.mock.calls.at(-1)?.[0] as {
    type: string;
    payload: { row: { key: string; value: string } };
  }[];
}

describe("useDashboardSets", () => {
  beforeEach(() => {
    fixture.settings = [];
    fixture.activeId = "";
    fixture.setActive.mockReset();
    fixture.dispatch.mockReset().mockResolvedValue(undefined);
  });

  it("opens the browser-local active dashboard", () => {
    const overview = storedDashboard(fallback);
    const planning = storedDashboard(moveRecentBeforePace(fallback), {
      id: "planning",
      name: "Planning",
      rank: 1,
    });
    fixture.settings = settingsFor(overview, planning);
    fixture.activeId = planning.id;

    const sets = useDashboardSets();

    expect(sets.activeDashboard.id).toBe(planning.id);
    expect(sets.layout).toEqual(moveRecentBeforePace(fallback));
  });

  it("falls back to the synced default when the local id is missing", () => {
    const overview = storedDashboard(fallback);
    const planning = storedDashboard(moveRecentBeforePace(fallback), {
      id: "planning",
      name: "Planning",
      rank: 1,
    });
    fixture.settings = settingsFor(planning, overview);
    fixture.activeId = "deleted-dashboard";

    expect(useDashboardSets().activeDashboard.id).toBe(planning.id);
  });

  it("ignores synced v1 and resolves the deterministic Overview", () => {
    fixture.settings = [
      {
        key: SETTING.dashboardLayout,
        value: JSON.stringify({ version: 1, ...moveRecentBeforePace(fallback) }),
      },
    ];

    const sets = useDashboardSets();

    expect(sets.activeDashboard.id).toBe(OVERVIEW_DASHBOARD_ID);
    expect(sets.layout).toEqual(fallback);
  });

  it("first layout save writes Overview plus separate default metadata", async () => {
    const sets = useDashboardSets();
    const next = moveRecentBeforePace(fallback);

    await sets.saveLayout(next);

    expect(dispatchedOps().map((op) => op.payload.row.key)).toEqual([
      dashboardItemKey(OVERVIEW_DASHBOARD_ID),
      DASHBOARD_DEFAULT_KEY,
    ]);
    expect(decodeDashboardDefinition(dispatchedOps()[0].payload.row.value)).toEqual(
      storedDashboard(next),
    );
  });

  it("saves only the active dashboard and preserves unknown instances", async () => {
    const unknown = {
      instanceId: "future-1",
      widgetType: "future-widget",
      size: "compact" as const,
      hidden: false,
      settings: { future: true },
    };
    const overview = storedDashboard(fallback);
    const planning = {
      ...storedDashboard(fallback, { id: "planning", name: "Planning", rank: 1 }),
      instances: [...storedDashboard(fallback).instances, unknown],
    };
    fixture.settings = settingsFor(overview, planning);
    fixture.activeId = planning.id;

    const sets = useDashboardSets();
    await sets.saveLayout({ ...sets.layout, hidden: ["pace"] });

    expect(dispatchedOps().map((op) => op.payload.row.key)).toEqual([
      dashboardItemKey(planning.id),
    ]);
    expect(
      decodeDashboardDefinition(dispatchedOps()[0].payload.row.value)?.instances.find(
        (instance) => instance.instanceId === unknown.instanceId,
      ),
    ).toEqual(unknown);
  });

  it("saves configured instance drafts only when the editor commits", async () => {
    const overview = storedDashboard(fallback);
    fixture.settings = settingsFor(overview);
    const sets = useDashboardSets();
    const configured = addDashboardWidgetInstance(
      overview,
      "watch-container",
      { subject: { type: "container", id: "general" } },
      () => "watch-1",
    );

    await sets.saveDashboard(configured);

    expect(decodeDashboardDefinition(dispatchedOps()[0].payload.row.value)).toEqual(
      configured,
    );
  });

  it("creates a starter while materializing the fallback Overview", async () => {
    await useDashboardSets().createDashboard("Quarterly planning", "planning");

    const ops = dispatchedOps();
    expect(ops.map((op) => op.payload.row.key)).toEqual([
      dashboardItemKey(OVERVIEW_DASHBOARD_ID),
      expect.stringMatching(/^dashboard\.v2\.item\./),
      DASHBOARD_DEFAULT_KEY,
    ]);
    const created = decodeDashboardDefinition(ops[1].payload.row.value)!;
    expect(created.name).toBe("Quarterly planning");
    expect(created.instances.map((instance) => instance.widgetType)).toEqual([
      "balance",
      "allocation",
      "upcoming",
      "goals",
    ]);
    expect(fixture.setActive).toHaveBeenCalledWith(created.id);
  });

  it("appends a created dashboard after sparse synced ranks", async () => {
    const overview = storedDashboard(fallback);
    const planning = storedDashboard(fallback, {
      id: "planning",
      name: "Planning",
      rank: 10,
    });
    fixture.settings = settingsFor(overview, planning);

    await useDashboardSets().createDashboard("Last", "empty");

    expect(decodeDashboardDefinition(dispatchedOps()[0].payload.row.value)?.rank).toBe(
      11,
    );
  });

  it("renames and duplicates with independent instance ids", async () => {
    const overview = storedDashboard(fallback);
    fixture.settings = settingsFor(overview);
    const sets = useDashboardSets();

    await sets.renameDashboard(overview.id, "My overview");
    expect(decodeDashboardDefinition(dispatchedOps()[0].payload.row.value)?.name).toBe(
      "My overview",
    );

    await sets.duplicateDashboard(overview.id);
    const duplicate = decodeDashboardDefinition(dispatchedOps()[0].payload.row.value)!;
    expect(duplicate.id).not.toBe(overview.id);
    expect(duplicate.name).toBe("Overview copy");
    expect(duplicate.instances.map((instance) => instance.instanceId)).not.toEqual(
      overview.instances.map((instance) => instance.instanceId),
    );
    expect(fixture.setActive).toHaveBeenCalledWith(duplicate.id);
  });

  it("reorders, changes default, and protects the last dashboard", async () => {
    const overview = storedDashboard(fallback);
    const planning = storedDashboard(fallback, {
      id: "planning",
      name: "Planning",
      rank: 1,
    });
    fixture.settings = settingsFor(overview, planning);
    const sets = useDashboardSets();

    await sets.reorderDashboard(planning.id, overview.id);
    expect(
      dispatchedOps().map((op) => [
        decodeDashboardDefinition(op.payload.row.value)?.id,
        decodeDashboardDefinition(op.payload.row.value)?.rank,
      ]),
    ).toEqual([
      [planning.id, 0],
      [overview.id, 1],
    ]);

    await sets.makeDefault(planning.id);
    expect(dispatchedOps()[0].payload.row).toEqual({
      key: DASHBOARD_DEFAULT_KEY,
      value: planning.id,
    });

    fixture.settings = settingsFor(overview);
    await expect(useDashboardSets().deleteDashboard(overview.id)).rejects.toThrow(
      "last dashboard",
    );
  });

  it("tombstones a dashboard and repairs default and local active selection", async () => {
    const overview = storedDashboard(fallback);
    const planning = storedDashboard(fallback, {
      id: "planning",
      name: "Planning",
      rank: 1,
    });
    fixture.settings = settingsFor(overview, planning);
    fixture.activeId = overview.id;

    await useDashboardSets().deleteDashboard(overview.id);

    const ops = dispatchedOps();
    expect(decodeDashboardDefinition(ops[0].payload.row.value)?.isDeleted).toBe(true);
    expect(ops[1].payload.row).toEqual({
      key: DASHBOARD_DEFAULT_KEY,
      value: planning.id,
    });
    expect(fixture.setActive).toHaveBeenCalledWith(planning.id);
  });
});
