"use client";

import { useMemo } from "react";
import { useAtomValue } from "jotai";
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
import { DASHBOARD_WIDGETS, type WidgetContext } from "./registry";
import { DashboardWidget } from "./WidgetShell";

/** The window the dashboard opens on when nothing has been chosen yet. */
const DEFAULT_PERIOD: ReportingPeriod = { kind: "preset", preset: "last-3-months" };
const PERIOD_KEY = "yaccount.dashboard.period";
const COMPARE_KEY = "yaccount.dashboard.compare";

/**
 * The dashboard (§6). It owns three things and delegates everything else: which
 * window you are looking at, the data every widget reads, and the ORDER of the
 * widgets — which is `DASHBOARD_WIDGETS`, a list, not a layout.
 *
 * There is deliberately no chart in this file. A screen that hand-lays its
 * widgets has to be taken apart to rearrange them; a screen that maps over a
 * registry only has to be given a different list, which is exactly what the
 * widget system planned after M11 will do.
 */
export function DashboardView() {
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
            <PeriodPicker
              period={period}
              onPeriodChange={setPeriod}
              comparePeriod={comparePeriod}
              onCompareChange={setComparePeriod}
            />
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
          <WidgetColumn range={primaryRange} data={data} />
          <WidgetColumn range={compareRange} data={data} />
        </div>
      ) : (
        <WidgetColumn range={primaryRange} data={data} />
      )}
    </div>
  );
}

/**
 * Every visible widget, in registry order, for one window. Compare (§6.2) is two
 * of these side by side — the same list read twice, so a widget added to the
 * registry appears in both columns without anyone remembering to add it twice.
 */
function WidgetColumn({
  range,
  data,
}: {
  range: DateRange;
  data: Omit<WidgetContext, "range">;
}) {
  const base: WidgetContext = { ...data, range };
  return (
    <div className="space-y-6">
      {DASHBOARD_WIDGETS.filter((w) => w.defaultVisible).map((w) => (
        <DashboardWidget key={w.id} def={w} base={base} />
      ))}
    </div>
  );
}
