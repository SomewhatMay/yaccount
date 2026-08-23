"use client";

import { useCallback, useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { setSetting } from "@/core/commands";
import { dispatchManyAtom, settingsAtom } from "@/features/store";
import {
  DASHBOARD_DEFAULT_KEY,
  applyDashboardLayout,
  dashboardItemKey,
  encodeDashboardDefinition,
  layoutFromDashboard,
  resolveDashboardState,
  type DashboardLayout,
} from "./dashboard-layout";
import { DASHBOARD_WIDGETS } from "./registry";

export function useDashboardLayout(): [
  DashboardLayout,
  (layout: DashboardLayout) => Promise<void>,
] {
  const settings = useAtomValue(settingsAtom);
  const dispatchMany = useSetAtom(dispatchManyAtom);
  const state = useMemo(
    () => resolveDashboardState(settings, DASHBOARD_WIDGETS),
    [settings],
  );
  const dashboard = state.dashboards.find(
    (candidate) => candidate.id === state.defaultDashboardId,
  )!;
  const layout = useMemo(
    () => layoutFromDashboard(dashboard, DASHBOARD_WIDGETS),
    [dashboard],
  );
  const setLayout = useCallback(
    (next: DashboardLayout) => {
      const updated = applyDashboardLayout(dashboard, next, DASHBOARD_WIDGETS);
      return dispatchMany([
        setSetting(dashboardItemKey(updated.id), encodeDashboardDefinition(updated)),
        setSetting(DASHBOARD_DEFAULT_KEY, updated.id),
      ]);
    },
    [dashboard, dispatchMany],
  );
  return [layout, setLayout];
}
