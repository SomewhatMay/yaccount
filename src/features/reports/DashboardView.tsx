"use client";

import { useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { LayoutDashboardIcon } from "lucide-react";
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
import {
  resolvePeriod,
  statsTransactions,
  type DateRange,
  type ReportingPeriod,
} from "@/core/engine";
import { todayIso } from "@/features/clock";
import { FigureSkeleton, ListSkeleton, PageHeader } from "@/features/ui";
import { PeriodPicker } from "./PeriodPicker";
import { useComparePref, usePeriodPref } from "./period-pref";
import { DASHBOARD_WIDGETS, type WidgetContext, type WidgetDef } from "./registry";
import { DashboardEditor } from "./DashboardEditor";
import { DashboardWidget } from "./WidgetShell";
import { WidgetGallerySheet } from "./WidgetGallerySheet";
import { setWidgetVisible, type DashboardLayout } from "./dashboard-layout";
import { useDashboardLayout } from "./use-dashboard-layout";

/** The window the dashboard opens on when nothing has been chosen yet. */
const DEFAULT_PERIOD: ReportingPeriod = { kind: "preset", preset: "last-3-months" };
const PERIOD_KEY = "yaccount.dashboard.period";
const COMPARE_KEY = "yaccount.dashboard.compare";

/**
 * The dashboard (§6). It owns browser-local reporting windows, the synced layout,
 * and the data every widget reads.
 */
export function DashboardView() {
  const [draftLayout, setDraftLayout] = useState<DashboardLayout | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const ready = useAtomValue(readyAtom);
  const categories = useAtomValue(categoriesAtom);
  const containers = useAtomValue(containersAtom);
  const transactions = useAtomValue(transactionsAtom);
  const budgetTargets = useAtomValue(budgetTargetsAtom);
  const snapshots = useAtomValue(snapshotsAtom);
  const recurringRules = useAtomValue(recurringRulesAtom);
  const goals = useAtomValue(goalsAtom);

  // Reporting windows are browser-local display preferences.
  const [period, setPeriod] = usePeriodPref(PERIOD_KEY, DEFAULT_PERIOD);
  const [comparePeriod, setComparePeriod] = useComparePref(COMPARE_KEY);
  const [layout, saveLayout] = useDashboardLayout();
  const activeLayout = draftLayout ?? layout;
  const visibleWidgets = useMemo(() => {
    const byId = new Map(DASHBOARD_WIDGETS.map((widget) => [widget.id, widget]));
    return activeLayout.order.flatMap((id) => {
      const widget = byId.get(id);
      return widget && !activeLayout.hidden.includes(id) ? [widget] : [];
    });
  }, [activeLayout]);
  const hiddenWidgets = useMemo(() => {
    const byId = new Map(DASHBOARD_WIDGETS.map((widget) => [widget.id, widget]));
    return activeLayout.order.flatMap((id) => {
      const widget = byId.get(id);
      return widget && activeLayout.hidden.includes(id) ? [widget] : [];
    });
  }, [activeLayout]);

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
      transactions: statsTransactions(transactions, categories),
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

  function beginEditing() {
    setDraftLayout({ order: [...layout.order], hidden: [...layout.hidden] });
  }

  function cancelEditing() {
    setGalleryOpen(false);
    setDraftLayout(null);
  }

  async function finishEditing() {
    if (!draftLayout) return;
    setSavingLayout(true);
    try {
      await saveLayout(draftLayout);
      setGalleryOpen(false);
      setDraftLayout(null);
    } catch {
      // `dispatchAtom` reports the write failure; keep the draft available to retry.
    } finally {
      setSavingLayout(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title={draftLayout ? "Arrange your dashboard" : "How the money moved"}
        action={
          ready ? (
            draftLayout ? (
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={savingLayout}
                  onClick={cancelEditing}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={savingLayout}
                  onClick={() => void finishEditing()}
                >
                  {savingLayout ? "Saving…" : "Done"}
                </Button>
              </div>
            ) : (
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
                  aria-label="Edit dashboard"
                  onClick={beginEditing}
                >
                  <LayoutDashboardIcon className="size-4" aria-hidden />
                  <span className="sr-only sm:not-sr-only">Edit</span>
                </Button>
              </div>
            )
          ) : undefined
        }
      />

      {!ready ? (
        <>
          <FigureSkeleton />
          <ListSkeleton rows={4} />
        </>
      ) : draftLayout ? (
        <DashboardEditor
          base={{ ...data, range: primaryRange }}
          widgets={visibleWidgets}
          layout={draftLayout}
          onLayoutChange={setDraftLayout}
          onAddWidgets={() => setGalleryOpen(true)}
        />
      ) : compareRange ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <WidgetColumn range={primaryRange} data={data} widgets={visibleWidgets} />
          <WidgetColumn range={compareRange} data={data} widgets={visibleWidgets} />
        </div>
      ) : (
        <WidgetColumn range={primaryRange} data={data} widgets={visibleWidgets} />
      )}
      <WidgetGallerySheet
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        widgets={hiddenWidgets}
        onAdd={(id) => {
          setDraftLayout((current) =>
            current ? setWidgetVisible(current, id, true) : current,
          );
        }}
      />
    </div>
  );
}

/**
 * Every visible widget, in synced order, for one window. Compare (§6.2)
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
