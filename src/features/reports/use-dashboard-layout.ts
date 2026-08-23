"use client";

import { useCallback, useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { setSetting } from "@/core/commands";
import { newId } from "@/core/model";
import { useLocalPref } from "@/features/prefs";
import { dispatchManyAtom, settingsAtom } from "@/features/store";
import {
  DASHBOARD_DEFAULT_KEY,
  applyDashboardLayout,
  createDashboardDefinition,
  dashboardItemKey,
  decodeDashboardDefinition,
  encodeDashboardDefinition,
  layoutFromDashboard,
  renameDashboard as renameDashboardDefinition,
  reorderDashboards,
  resolveDashboardState,
  tombstoneDashboard,
  type DashboardDefinition,
  type DashboardLayout,
  type DashboardStarter,
} from "./dashboard-layout";
import { DASHBOARD_WIDGETS } from "./registry";

export const ACTIVE_DASHBOARD_KEY = "yaccount.dashboard.active.v2";

function isDashboardId(value: string): value is string {
  return value.trim().length > 0;
}

export interface DashboardSetsController {
  dashboards: DashboardDefinition[];
  activeDashboard: DashboardDefinition;
  defaultDashboardId: string;
  layout: DashboardLayout;
  setActiveDashboard: (id: string) => void;
  saveLayout: (layout: DashboardLayout) => Promise<void>;
  createDashboard: (name: string, starter: DashboardStarter) => Promise<void>;
  renameDashboard: (id: string, name: string) => Promise<void>;
  duplicateDashboard: (id: string) => Promise<void>;
  reorderDashboard: (activeId: string, overId: string) => Promise<void>;
  makeDefault: (id: string) => Promise<void>;
  deleteDashboard: (id: string) => Promise<void>;
}

export function useDashboardSets(): DashboardSetsController {
  const settings = useAtomValue(settingsAtom);
  const dispatchMany = useSetAtom(dispatchManyAtom);
  const state = useMemo(
    () => resolveDashboardState(settings, DASHBOARD_WIDGETS),
    [settings],
  );
  const [localActiveId, setLocalActiveId] = useLocalPref(
    ACTIVE_DASHBOARD_KEY,
    "",
    isDashboardId,
  );
  const activeDashboard =
    state.dashboards.find((dashboard) => dashboard.id === localActiveId) ??
    state.dashboards.find((dashboard) => dashboard.id === state.defaultDashboardId)!;
  const layout = useMemo(
    () => layoutFromDashboard(activeDashboard, DASHBOARD_WIDGETS),
    [activeDashboard],
  );
  const nextRank = Math.max(-1, ...state.dashboards.map(({ rank }) => rank)) + 1;
  const hasDefaultSetting = settings.some(
    (setting) => setting.key === DASHBOARD_DEFAULT_KEY,
  );

  const defaultOp = useCallback(
    () => setSetting(DASHBOARD_DEFAULT_KEY, state.defaultDashboardId),
    [state.defaultDashboardId],
  );
  const dashboardOp = useCallback(
    (dashboard: DashboardDefinition) =>
      setSetting(dashboardItemKey(dashboard.id), encodeDashboardDefinition(dashboard)),
    [],
  );
  const missingDashboardOps = useCallback(
    () =>
      state.dashboards.flatMap((dashboard) => {
        const stored = settings.find(
          (setting) => setting.key === dashboardItemKey(dashboard.id),
        );
        const decoded = stored ? decodeDashboardDefinition(stored.value) : null;
        return decoded?.id === dashboard.id ? [] : [dashboardOp(dashboard)];
      }),
    [dashboardOp, settings, state.dashboards],
  );

  const setActiveDashboard = useCallback(
    (id: string) => {
      if (state.dashboards.some((dashboard) => dashboard.id === id)) {
        setLocalActiveId(id);
      }
    },
    [setLocalActiveId, state.dashboards],
  );

  const saveLayout = useCallback(
    (next: DashboardLayout) => {
      const updated = applyDashboardLayout(activeDashboard, next, DASHBOARD_WIDGETS);
      return dispatchMany([
        dashboardOp(updated),
        ...(!hasDefaultSetting ? [defaultOp()] : []),
      ]);
    },
    [activeDashboard, dashboardOp, defaultOp, dispatchMany, hasDefaultSetting],
  );

  const createDashboard = useCallback(
    async (name: string, starter: DashboardStarter) => {
      const created = createDashboardDefinition({
        id: newId(),
        name,
        rank: nextRank,
        starter,
        current: activeDashboard,
        widgets: DASHBOARD_WIDGETS,
        makeId: newId,
      });
      await dispatchMany([
        ...missingDashboardOps(),
        dashboardOp(created),
        ...(!hasDefaultSetting ? [defaultOp()] : []),
      ]);
      setLocalActiveId(created.id);
    },
    [
      activeDashboard,
      dashboardOp,
      defaultOp,
      dispatchMany,
      hasDefaultSetting,
      missingDashboardOps,
      setLocalActiveId,
      nextRank,
    ],
  );

  const renameDashboard = useCallback(
    async (id: string, name: string) => {
      const dashboard = state.dashboards.find((candidate) => candidate.id === id);
      if (!dashboard) throw new Error("dashboard not found");
      await dispatchMany([
        dashboardOp(renameDashboardDefinition(dashboard, name)),
        ...(!hasDefaultSetting ? [defaultOp()] : []),
      ]);
    },
    [dashboardOp, defaultOp, dispatchMany, hasDefaultSetting, state.dashboards],
  );

  const duplicateDashboard = useCallback(
    async (id: string) => {
      const dashboard = state.dashboards.find((candidate) => candidate.id === id);
      if (!dashboard) throw new Error("dashboard not found");
      const duplicate = createDashboardDefinition({
        id: newId(),
        name: `${dashboard.name} copy`,
        rank: nextRank,
        starter: "current",
        current: dashboard,
        widgets: DASHBOARD_WIDGETS,
        makeId: newId,
      });
      await dispatchMany([
        ...missingDashboardOps(),
        dashboardOp(duplicate),
        ...(!hasDefaultSetting ? [defaultOp()] : []),
      ]);
      setLocalActiveId(duplicate.id);
    },
    [
      dashboardOp,
      defaultOp,
      dispatchMany,
      hasDefaultSetting,
      missingDashboardOps,
      nextRank,
      setLocalActiveId,
      state.dashboards,
    ],
  );

  const reorderDashboard = useCallback(
    async (activeId: string, overId: string) => {
      const reordered = reorderDashboards(state.dashboards, activeId, overId);
      const changed = reordered.filter((dashboard) => {
        const before = state.dashboards.find(
          (candidate) => candidate.id === dashboard.id,
        );
        return before?.rank !== dashboard.rank;
      });
      if (changed.length > 0) await dispatchMany(changed.map(dashboardOp));
    },
    [dashboardOp, dispatchMany, state.dashboards],
  );

  const makeDefault = useCallback(
    async (id: string) => {
      if (!state.dashboards.some((dashboard) => dashboard.id === id)) {
        throw new Error("dashboard not found");
      }
      await dispatchMany([setSetting(DASHBOARD_DEFAULT_KEY, id)]);
    },
    [dispatchMany, state.dashboards],
  );

  const deleteDashboard = useCallback(
    async (id: string) => {
      const tombstone = tombstoneDashboard(state.dashboards, id);
      const remaining = state.dashboards.filter((dashboard) => dashboard.id !== id);
      const next = remaining[0];
      const deletingDefault = state.defaultDashboardId === id;
      await dispatchMany([
        dashboardOp(tombstone),
        ...(deletingDefault
          ? [setSetting(DASHBOARD_DEFAULT_KEY, next.id)]
          : !hasDefaultSetting
            ? [defaultOp()]
            : []),
      ]);
      if (activeDashboard.id === id) setLocalActiveId(next.id);
    },
    [
      activeDashboard.id,
      dashboardOp,
      defaultOp,
      dispatchMany,
      hasDefaultSetting,
      setLocalActiveId,
      state.dashboards,
      state.defaultDashboardId,
    ],
  );

  return {
    dashboards: state.dashboards,
    activeDashboard,
    defaultDashboardId: state.defaultDashboardId,
    layout,
    setActiveDashboard,
    saveLayout,
    createDashboard,
    renameDashboard,
    duplicateDashboard,
    reorderDashboard,
    makeDefault,
    deleteDashboard,
  };
}
