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
  settingsAtom,
  transactionsAtom,
} from "@/features/store";
import {
  resolvePeriod,
  statsTransactions,
  type DateRange,
  type ReportingPeriod,
} from "@/core/engine";
import { newId } from "@/core/model";
import { todayIso } from "@/features/clock";
import { FigureSkeleton, ListSkeleton, PageHeader } from "@/features/ui";
import { PeriodPicker } from "./PeriodPicker";
import { useComparePref, usePeriodPref } from "./period-pref";
import { DASHBOARD_WIDGETS, rangeText, type WidgetContext } from "./registry";
import { DashboardEditor } from "./DashboardEditor";
import { DashboardSetBar } from "./DashboardSets";
import { DashboardWidget } from "./WidgetShell";
import { WidgetGallerySheet } from "./WidgetGallerySheet";
import {
  addDashboardWidgetInstance,
  applyDashboardLayout,
  dashboardWidgetEntries,
  layoutFromDashboard,
  setWidgetVisible,
  type DashboardDefinition,
  type DashboardWidgetEntry,
} from "./dashboard-layout";
import { useDashboardSets } from "./use-dashboard-layout";
import { createDashboardAggregates } from "./dashboard-aggregates";

/** The window the dashboard opens on when nothing has been chosen yet. */
const DEFAULT_PERIOD: ReportingPeriod = { kind: "preset", preset: "last-3-months" };
const PERIOD_KEY_PREFIX = "yaccount.dashboard.period";
const COMPARE_KEY_PREFIX = "yaccount.dashboard.compare";

/**
 * The dashboard (§6). It owns browser-local reporting windows, the synced layout,
 * and the data every widget reads.
 */
export function DashboardView() {
  const [draftDashboard, setDraftDashboard] = useState<DashboardDefinition | null>(null);
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
  const settings = useAtomValue(settingsAtom);

  const dashboardSets = useDashboardSets();
  const activeDashboardId = dashboardSets.activeDashboard.id;
  // Reporting windows are browser-local and independent for every dashboard.
  const [period, setPeriod] = usePeriodPref(
    `${PERIOD_KEY_PREFIX}.${activeDashboardId}`,
    DEFAULT_PERIOD,
  );
  const [comparePeriod, setComparePeriod] = useComparePref(
    `${COMPARE_KEY_PREFIX}.${activeDashboardId}`,
  );
  const activeDashboard = draftDashboard ?? dashboardSets.activeDashboard;
  const activeLayout = draftDashboard
    ? layoutFromDashboard(draftDashboard, DASHBOARD_WIDGETS)
    : dashboardSets.layout;
  const widgetEntries = useMemo(
    () => dashboardWidgetEntries(activeDashboard, activeLayout, DASHBOARD_WIDGETS),
    [activeDashboard, activeLayout],
  );
  const visibleWidgets = useMemo(
    () =>
      widgetEntries.filter(
        ({ instance }) => !activeLayout.hidden.includes(instance.instanceId),
      ),
    [activeLayout.hidden, widgetEntries],
  );
  // `today` is stable for the session's render; `core` stays clock-free.
  const today = useMemo(() => todayIso(), []);
  const primaryRange = useMemo(() => resolvePeriod(period, today), [period, today]);
  const compareRange = useMemo(
    () => (comparePeriod ? resolvePeriod(comparePeriod, today) : null),
    [comparePeriod, today],
  );

  const data = useMemo(() => {
    const reportTransactions = statsTransactions(transactions, categories);
    return {
      today,
      categories,
      containers,
      ledgerTransactions: transactions,
      reportTransactions,
      budgetTargets,
      snapshots,
      recurringRules,
      goals,
      syncedSettings: settings,
      aggregates: createDashboardAggregates({
        budgetTargets,
        categories,
        containers,
        ledgerTransactions: transactions,
        reportTransactions,
        recurringRules,
        snapshots,
        goals,
      }),
    };
  }, [
    today,
    categories,
    containers,
    transactions,
    budgetTargets,
    snapshots,
    recurringRules,
    goals,
    settings,
  ]);

  function beginEditing() {
    setDraftDashboard({
      ...dashboardSets.activeDashboard,
      instances: dashboardSets.activeDashboard.instances.map((instance) => ({
        ...instance,
        ...(instance.subject ? { subject: { ...instance.subject } } : {}),
        ...(instance.settings ? { settings: { ...instance.settings } } : {}),
      })),
    });
  }

  function saveInstanceSettings(
    instanceId: string,
    settings: Record<string, unknown>,
  ): Promise<void> {
    return dashboardSets.saveDashboard({
      ...dashboardSets.activeDashboard,
      instances: dashboardSets.activeDashboard.instances.map((instance) =>
        instance.instanceId === instanceId ? { ...instance, settings } : instance,
      ),
    });
  }

  function cancelEditing() {
    setGalleryOpen(false);
    setDraftDashboard(null);
  }

  async function finishEditing() {
    if (!draftDashboard) return;
    setSavingLayout(true);
    try {
      await dashboardSets.saveDashboard(draftDashboard);
      setGalleryOpen(false);
      setDraftDashboard(null);
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
        title={draftDashboard ? "Arrange your dashboard" : "How the money moved"}
        action={
          ready ? (
            draftDashboard ? (
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

      {ready && !draftDashboard && (
        <DashboardSetBar
          dashboards={dashboardSets.dashboards}
          activeId={dashboardSets.activeDashboard.id}
          defaultId={dashboardSets.defaultDashboardId}
          onSelect={dashboardSets.setActiveDashboard}
          onCreate={dashboardSets.createDashboard}
          onRename={dashboardSets.renameDashboard}
          onDuplicate={dashboardSets.duplicateDashboard}
          onReorder={dashboardSets.reorderDashboard}
          onMakeDefault={dashboardSets.makeDefault}
          onDelete={dashboardSets.deleteDashboard}
        />
      )}

      {!ready ? (
        <>
          <FigureSkeleton />
          <ListSkeleton rows={4} />
        </>
      ) : draftDashboard ? (
        <DashboardEditor
          base={{ ...data, range: primaryRange }}
          widgets={visibleWidgets}
          allWidgets={widgetEntries}
          layout={activeLayout}
          onLayoutChange={(next) =>
            setDraftDashboard((current) =>
              current ? applyDashboardLayout(current, next, DASHBOARD_WIDGETS) : current,
            )
          }
          onAddWidgets={() => setGalleryOpen(true)}
        />
      ) : compareRange ? (
        <ComparisonWidgets
          primaryRange={primaryRange}
          compareRange={compareRange}
          data={data}
          widgets={visibleWidgets}
          onSaveInstanceSettings={saveInstanceSettings}
        />
      ) : (
        <WidgetColumn
          range={primaryRange}
          data={data}
          widgets={visibleWidgets}
          onSaveInstanceSettings={saveInstanceSettings}
        />
      )}
      <WidgetGallerySheet
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        definitions={DASHBOARD_WIDGETS}
        entries={widgetEntries}
        hiddenInstanceIds={activeLayout.hidden}
        context={{ ...data, range: primaryRange }}
        onRestore={(instanceId) => {
          setDraftDashboard((current) => {
            if (!current) return current;
            const layout = layoutFromDashboard(current, DASHBOARD_WIDGETS);
            return applyDashboardLayout(
              current,
              setWidgetVisible(
                layout,
                instanceId,
                true,
                widgetEntries.find(({ instance }) => instance.widgetType === "balance")
                  ?.instance.instanceId,
              ),
              DASHBOARD_WIDGETS,
            );
          });
        }}
        onCreate={(widgetType, configuration) => {
          setDraftDashboard((current) =>
            current
              ? addDashboardWidgetInstance(current, widgetType, configuration, newId)
              : current,
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
  onSaveInstanceSettings,
}: {
  range: DateRange;
  data: Omit<WidgetContext, "range">;
  widgets: readonly DashboardWidgetEntry[];
  onSaveInstanceSettings: (
    instanceId: string,
    settings: Record<string, unknown>,
  ) => Promise<void>;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {widgets.map(({ instance, def }) => {
        const base: WidgetContext = {
          ...data,
          range,
          instanceSettings: instance.settings ?? {},
          saveInstanceSettings: (settings) =>
            onSaveInstanceSettings(instance.instanceId, settings),
        };
        return (
          <div
            key={instance.instanceId}
            className={instance.size === "expanded" ? "min-w-0 md:col-span-2" : "min-w-0"}
          >
            <DashboardWidget
              instanceId={instance.instanceId}
              size={instance.size}
              def={def}
              base={base}
            />
          </div>
        );
      })}
    </div>
  );
}

function ComparisonWidgets({
  primaryRange,
  compareRange,
  data,
  widgets,
  onSaveInstanceSettings,
}: {
  primaryRange: DateRange;
  compareRange: DateRange;
  data: Omit<WidgetContext, "range">;
  widgets: readonly DashboardWidgetEntry[];
  onSaveInstanceSettings: (
    instanceId: string,
    settings: Record<string, unknown>,
  ) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      {widgets.map(({ instance, def }) => {
        const primary: WidgetContext = {
          ...data,
          range: primaryRange,
          instanceSettings: instance.settings ?? {},
          saveInstanceSettings: (settings) =>
            onSaveInstanceSettings(instance.instanceId, settings),
        };
        if (def.fixedWindow) {
          return (
            <div
              key={instance.instanceId}
              className={
                instance.size === "compact" ? "md:w-[calc(50%-0.75rem)]" : undefined
              }
            >
              <DashboardWidget
                instanceId={instance.instanceId}
                size={instance.size}
                def={def}
                base={primary}
                comparisonUnsupported
              />
            </div>
          );
        }
        return (
          <div key={instance.instanceId} className="grid gap-6 lg:grid-cols-2">
            <ComparisonCell
              side="primary"
              label={rangeText(primaryRange)}
              instance={instance}
              def={def}
              base={primary}
            />
            <ComparisonCell
              side="compare"
              label={rangeText(compareRange)}
              instance={instance}
              def={def}
              base={{ ...primary, range: compareRange }}
            />
          </div>
        );
      })}
    </div>
  );
}

function ComparisonCell({
  side,
  label,
  instance,
  def,
  base,
}: {
  side: "primary" | "compare";
  label: string;
  instance: DashboardWidgetEntry["instance"];
  def: DashboardWidgetEntry["def"];
  base: WidgetContext;
}) {
  return (
    <section className="space-y-2" aria-label={`${def.title}, ${label}`}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <DashboardWidget
        instanceId={instance.instanceId}
        surfaceId={`${instance.instanceId}-${side}`}
        size={instance.size}
        def={def}
        base={base}
      />
    </section>
  );
}
