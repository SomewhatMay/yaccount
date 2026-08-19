"use client";

import { useCallback, useMemo } from "react";
import { useLocalPref } from "@/features/prefs";
import {
  DASHBOARD_LAYOUT_KEY,
  defaultDashboardLayout,
  encodeDashboardLayout,
  isDashboardLayoutPref,
  resolveDashboardLayout,
  type DashboardLayout,
} from "./dashboard-layout";
import { DASHBOARD_WIDGETS } from "./registry";

const DEFAULT_LAYOUT = defaultDashboardLayout(DASHBOARD_WIDGETS);
const DEFAULT_LAYOUT_PREF = encodeDashboardLayout(DEFAULT_LAYOUT);

export function useDashboardLayout(): [
  DashboardLayout,
  (layout: DashboardLayout) => void,
] {
  const [raw, setRaw] = useLocalPref(
    DASHBOARD_LAYOUT_KEY,
    DEFAULT_LAYOUT_PREF,
    isDashboardLayoutPref,
  );
  const layout = useMemo(() => resolveDashboardLayout(raw, DASHBOARD_WIDGETS), [raw]);
  const setLayout = useCallback(
    (next: DashboardLayout) => setRaw(encodeDashboardLayout(next)),
    [setRaw],
  );
  return [layout, setLayout];
}
