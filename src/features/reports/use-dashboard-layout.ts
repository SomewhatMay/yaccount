"use client";

import { useCallback, useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { setSetting } from "@/core/commands";
import { SETTING } from "@/core/model";
import { dispatchAtom, settingsAtom } from "@/features/store";
import { useLocalPref } from "@/features/prefs";
import {
  DASHBOARD_LAYOUT_FALLBACK_KEY,
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
  (layout: DashboardLayout) => Promise<void>,
] {
  const settings = useAtomValue(settingsAtom);
  const dispatch = useSetAtom(dispatchAtom);
  // The browser value is a migration fallback only. A synced setting is the
  // authoritative source, and every new write goes through the op journal.
  const [browserRaw] = useLocalPref(
    DASHBOARD_LAYOUT_FALLBACK_KEY,
    DEFAULT_LAYOUT_PREF,
    isDashboardLayoutPref,
  );
  const syncedRaw = settings.find(
    (setting) => setting.key === SETTING.dashboardLayout,
  )?.value;
  const raw = syncedRaw ?? browserRaw;
  const layout = useMemo(() => resolveDashboardLayout(raw, DASHBOARD_WIDGETS), [raw]);
  const setLayout = useCallback(
    (next: DashboardLayout) =>
      dispatch(setSetting(SETTING.dashboardLayout, encodeDashboardLayout(next))),
    [dispatch],
  );
  return [layout, setLayout];
}
