"use client";

import { useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  budgetTargetsAtom,
  categoriesAtom,
  containersAtom,
  goalsAtom,
  readyAtom,
  recurringRulesAtom,
  snapshotsAtom,
  transactionsAtom,
} from "@/features/store";
import { resolvePeriod, type DateRange, type ReportingPeriod } from "@/core/engine";
import { todayIso } from "@/features/clock";
import { FigureSkeleton, ListSkeleton, PageHeader } from "@/features/ui";
import { PeriodPicker } from "./PeriodPicker";
import { useComparePref, usePeriodPref } from "./period-pref";
import { DASHBOARD_WIDGETS, type WidgetContext, type WidgetDef } from "./registry";
import { DashboardWidget } from "./WidgetShell";
import { WidgetLayoutSheet } from "./WidgetLayoutSheet";
import { useDashboardLayout } from "./use-dashboard-layout";

/** The window the dashboard opens on when nothing has been chosen yet. */
const DEFAULT_PERIOD: ReportingPeriod = { kind: "preset", preset: "last-3-months" };
const PERIOD_KEY = "yaccount.dashboard.period";
const COMPARE_KEY = "yaccount.dashboard.compare";

/**
 * The dashboard (§6). It owns the reporting windows, the data every widget
 * reads, and the device-local view of the stable widget registry.
 */
export function DashboardView() {
  const [customizing, setCustomizing] = useState(false);
  const ready = useAtomValue(readyAtom);
  const categories = useAtomValue(categoriesAtom);
  const containers = useAtomValue(containersAtom);
  const transactions = useAtomValue(transactionsAtom);
  const budgetTargets = useAtomValue(budgetTargetsAtom);
  const snapshots = useAtomValue(snapshotsAtom);
  const recurringRules = useAtomValue(recurringRulesAtom);
  const goals = useAtomValue(goalsAtom);

  // The period survives a refresh now: it is a view preference, stored per device
  // like every other one. Choosing "Year to date", reloading and quietly being
  // shown three months was a small lie the screen told on every visit.
  const [period, setPeriod] = usePeriodPref(PERIOD_KEY, DEFAULT_PERIOD);
  const [comparePeriod, setComparePeriod] = useComparePref(COMPARE_KEY);
  const [layout, setLayout] = useDashboardLayout();
  const visibleWidgets = useMemo(() => {
    const byId = new Map(DASHBOARD_WIDGETS.map((widget) => [widget.id, widget]));
    return layout.order.flatMap((id) => {
      const widget = byId.get(id);
      return widget && !layout.hidden.includes(id) ? [widget] : [];
    });
  }, [layout]);

  // `today` is stable for the session's render; `core` stays clock-free.
  const today = useMemo(() => todayIso(), []);
  const primaryRange = useMemo(() => resolvePeriod(period, today), [period, today]);
  const compareRange = useMemo(
    () => (comparePeriod ? resolvePeriod(comparePeriod, today) : null),
    [comparePeriod, today],
  );

  const data = useMemo(
    () => ({
      today,
      categories,
      containers,
      transactions,
      budgetTargets,
      snapshots,
      recurringRules,
      goals,
    }),
    [
      today,
      categories,
      containers,
      transactions,
      budgetTargets,
      snapshots,
      recurringRules,
      goals,
    ],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title="How the money moved"
        action={
          ready ? (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
              <PeriodPicker
                period={period}
                onPeriodChange={setPeriod}
                comparePeriod={comparePeriod}
                onCompareChange={setComparePeriod}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 rounded-full px-2"
                aria-label="Customize dashboard"
                onClick={() => setCustomizing(true)}
              >
                <SlidersHorizontalIcon className="size-4" aria-hidden />
                <span className="sr-only sm:not-sr-only">Customize</span>
              </Button>
            </div>
          ) : undefined
        }
      />

      {!ready ? (
        <>
          <FigureSkeleton />
          <ListSkeleton rows={4} />
        </>
      ) : compareRange ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <WidgetColumn range={primaryRange} data={data} widgets={visibleWidgets} />
          <WidgetColumn range={compareRange} data={data} widgets={visibleWidgets} />
        </div>
      ) : (
        <WidgetColumn range={primaryRange} data={data} widgets={visibleWidgets} />
      )}
      <WidgetLayoutSheet
        open={customizing}
        onOpenChange={setCustomizing}
        widgets={DASHBOARD_WIDGETS}
        layout={layout}
        onLayoutChange={setLayout}
      />
    </div>
  );
}

/**
 * Every visible widget, in the device's order, for one window. Compare (§6.2)
 * reads the same resolved list twice.
 */
function WidgetColumn({
  range,
  data,
  widgets,
}: {
  range: DateRange;
  data: Omit<WidgetContext, "range">;
  widgets: readonly WidgetDef[];
}) {
  const base: WidgetContext = { ...data, range };
  return (
    <div className="space-y-6">
      {widgets.map((w) => (
        <DashboardWidget key={w.id} def={w} base={base} />
      ))}
    </div>
  );
}
