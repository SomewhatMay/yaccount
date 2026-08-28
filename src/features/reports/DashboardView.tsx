"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimationControllerProvider } from "recharts";
import { Button } from "@/components/ui/button";
import {
  budgetTargetsAtom,
  categoriesAtom,
  containersAtom,
  cravingWinsAtom,
  dispatchManyAtom,
  flashRowAtom,
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
import { DashboardOverflowMenu, DashboardSetBar } from "./DashboardSets";
import { DashboardWidget } from "./WidgetShell";
import { WidgetGallerySheet } from "./WidgetGallerySheet";
import {
  addDashboardWidgetInstance,
  applyDashboardLayout,
  curatedOverviewWidgets,
  dashboardWidgetEntries,
  layoutFromDashboard,
  resetDashboardLayout,
  setWidgetVisible,
  setWidgetSize,
  type DashboardDefinition,
  type DashboardWidgetEntry,
} from "./dashboard-layout";
import { useDashboardSets } from "./use-dashboard-layout";
import { createDashboardAggregates } from "./dashboard-aggregates";
import { interruptibleAnimationController } from "./chart-animation";

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
  const [manageDashboardsOpen, setManageDashboardsOpen] = useState(false);
  const ready = useAtomValue(readyAtom);
  const categories = useAtomValue(categoriesAtom);
  const containers = useAtomValue(containersAtom);
  const cravingWins = useAtomValue(cravingWinsAtom);
  const transactions = useAtomValue(transactionsAtom);
  const budgetTargets = useAtomValue(budgetTargetsAtom);
  const snapshots = useAtomValue(snapshotsAtom);
  const recurringRules = useAtomValue(recurringRulesAtom);
  const goals = useAtomValue(goalsAtom);
  const settings = useAtomValue(settingsAtom);
  const dispatchOps = useSetAtom(dispatchManyAtom);
  const flashRow = useSetAtom(flashRowAtom);
  // `today` is stable for the session's render; `core` stays clock-free.
  const today = useMemo(() => todayIso(), []);
  const data = useMemo(() => {
    const reportTransactions = statsTransactions(transactions, categories);
    return {
      today,
      categories,
      containers,
      cravingWins,
      ledgerTransactions: transactions,
      reportTransactions,
      budgetTargets,
      snapshots,
      recurringRules,
      goals,
      syncedSettings: settings,
      dispatchOps,
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
    cravingWins,
    transactions,
    budgetTargets,
    snapshots,
    recurringRules,
    goals,
    settings,
    dispatchOps,
  ]);
  const overviewCuration = useMemo(() => {
    const hasExpenseBudget = data.aggregates.budgetTriage(today).rows.length > 0;
    const hasActiveGoal = data.aggregates.goalOutlook(today).rows.length > 0;
    const landing = data.aggregates.monthLanding(today);
    const incomeCategoryIds = new Set(
      categories
        .filter((category) => category.type === "income" && !category.is_archived)
        .map((category) => category.id),
    );
    return curatedOverviewWidgets({
      hasExpenseBudget,
      hasRecurringSchedule: recurringRules.some((rule) => rule.status === "active"),
      hasScheduledIncome: recurringRules.some(
        (rule) =>
          rule.status === "active" &&
          rule.template_category_id !== null &&
          incomeCategoryIds.has(rule.template_category_id) &&
          (rule.template_amount ?? 0) > 0,
      ),
      hasActiveGoal,
      hasLandingHistory: landing.history.length >= 2,
      hasLandingSignal:
        landing.scheduledItems.length > 0 ||
        landing.unknownItems.length > 0 ||
        landing.history.some((item) => item.flexibleSpending !== 0),
      hasCravingWins: cravingWins.length > 0,
    });
  }, [categories, cravingWins.length, data.aggregates, recurringRules, today]);

  const dashboardSets = useDashboardSets(overviewCuration);
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
  const primaryRange = useMemo(() => resolvePeriod(period, today), [period, today]);
  const compareRange = useMemo(
    () => (comparePeriod ? resolvePeriod(comparePeriod, today) : null),
    [comparePeriod, today],
  );

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

  function saveInstanceSubject(
    instanceId: string,
    subject: { type: string; id: string },
  ): Promise<void> {
    return dashboardSets.saveDashboard({
      ...dashboardSets.activeDashboard,
      instances: dashboardSets.activeDashboard.instances.map((instance) =>
        instance.instanceId === instanceId ? { ...instance, subject } : instance,
      ),
    });
  }

  function saveInstanceSize(
    instanceId: string,
    size: "compact" | "expanded",
  ): Promise<void> {
    return dashboardSets.saveLayout(
      setWidgetSize(dashboardSets.layout, instanceId, size),
    );
  }

  function hideInstance(instanceId: string): Promise<void> {
    return dashboardSets.saveLayout(
      setWidgetVisible(dashboardSets.layout, instanceId, false),
    );
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
      <div className="space-y-2">
        <PageHeader
          eyebrow={draftDashboard ? "Arrange widgets" : "Financial overview"}
          title="Dashboard"
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
                <div className="flex min-w-0 items-center justify-end gap-1.5">
                  <PeriodPicker
                    period={period}
                    onPeriodChange={setPeriod}
                    comparePeriod={comparePeriod}
                    onCompareChange={setComparePeriod}
                  />
                  <DashboardOverflowMenu
                    onCustomize={beginEditing}
                    onManage={() => setManageDashboardsOpen(true)}
                  />
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
            manageOpen={manageDashboardsOpen}
            onManageOpenChange={setManageDashboardsOpen}
          />
        )}
      </div>

      <AnimationControllerProvider value={interruptibleAnimationController}>
        {!ready ? (
          <>
            <FigureSkeleton />
            <ListSkeleton rows={4} />
          </>
        ) : draftDashboard ? (
          <DashboardEditor
            base={{ ...data, range: primaryRange }}
            widgets={visibleWidgets}
            layout={activeLayout}
            resetLayout={resetDashboardLayout(
              draftDashboard,
              DASHBOARD_WIDGETS,
              overviewCuration,
            )}
            onLayoutChange={(next) =>
              setDraftDashboard((current) =>
                current
                  ? applyDashboardLayout(current, next, DASHBOARD_WIDGETS)
                  : current,
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
            onSaveInstanceSubject={saveInstanceSubject}
            onSaveInstanceSize={saveInstanceSize}
            onHideInstance={hideInstance}
          />
        ) : (
          <WidgetColumn
            range={primaryRange}
            data={data}
            widgets={visibleWidgets}
            onSaveInstanceSettings={saveInstanceSettings}
            onSaveInstanceSubject={saveInstanceSubject}
            onSaveInstanceSize={saveInstanceSize}
            onHideInstance={hideInstance}
          />
        )}
      </AnimationControllerProvider>
      <WidgetGallerySheet
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        definitions={DASHBOARD_WIDGETS}
        entries={widgetEntries}
        hiddenInstanceIds={activeLayout.hidden}
        context={{ ...data, range: primaryRange }}
        onRestore={(instanceId) => {
          if (!draftDashboard) return;
          const layout = layoutFromDashboard(draftDashboard, DASHBOARD_WIDGETS);
          setDraftDashboard(
            applyDashboardLayout(
              draftDashboard,
              setWidgetVisible(layout, instanceId, true),
              DASHBOARD_WIDGETS,
            ),
          );
          setGalleryOpen(false);
          flashRow({ id: instanceId, scroll: true });
        }}
        onCreate={(widgetType, configuration) => {
          if (!draftDashboard) return;
          const next = addDashboardWidgetInstance(
            draftDashboard,
            widgetType,
            configuration,
            newId,
          );
          const instanceId = next.instances.at(-1)!.instanceId;
          setDraftDashboard(next);
          setGalleryOpen(false);
          flashRow({ id: instanceId, scroll: true });
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
  onSaveInstanceSubject,
  onSaveInstanceSize,
  onHideInstance,
}: {
  range: DateRange;
  data: Omit<WidgetContext, "range">;
  widgets: readonly DashboardWidgetEntry[];
  onSaveInstanceSettings: (
    instanceId: string,
    settings: Record<string, unknown>,
  ) => Promise<void>;
  onSaveInstanceSubject: (
    instanceId: string,
    subject: { type: string; id: string },
  ) => Promise<void>;
  onSaveInstanceSize: (instanceId: string, size: "compact" | "expanded") => Promise<void>;
  onHideInstance: (instanceId: string) => Promise<void>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 md:gap-6">
      {widgets.map(({ instance, def }) => {
        const base: WidgetContext = {
          ...data,
          range,
          instanceSubject: instance.subject,
          instanceSettings: instance.settings ?? {},
          saveInstanceSubject: (subject) =>
            onSaveInstanceSubject(instance.instanceId, subject),
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
              onSizeChange={(size) => onSaveInstanceSize(instance.instanceId, size)}
              onHide={() => onHideInstance(instance.instanceId)}
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
  onSaveInstanceSubject,
  onSaveInstanceSize,
  onHideInstance,
}: {
  primaryRange: DateRange;
  compareRange: DateRange;
  data: Omit<WidgetContext, "range">;
  widgets: readonly DashboardWidgetEntry[];
  onSaveInstanceSettings: (
    instanceId: string,
    settings: Record<string, unknown>,
  ) => Promise<void>;
  onSaveInstanceSubject: (
    instanceId: string,
    subject: { type: string; id: string },
  ) => Promise<void>;
  onSaveInstanceSize: (instanceId: string, size: "compact" | "expanded") => Promise<void>;
  onHideInstance: (instanceId: string) => Promise<void>;
}) {
  return (
    <div className="space-y-3 md:space-y-6">
      {widgets.map(({ instance, def }) => {
        const primary: WidgetContext = {
          ...data,
          range: primaryRange,
          instanceSubject: instance.subject,
          instanceSettings: instance.settings ?? {},
          saveInstanceSubject: (subject) =>
            onSaveInstanceSubject(instance.instanceId, subject),
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
                onSizeChange={(size) => onSaveInstanceSize(instance.instanceId, size)}
                onHide={() => onHideInstance(instance.instanceId)}
              />
            </div>
          );
        }
        return (
          <div key={instance.instanceId} className="grid gap-3 lg:grid-cols-2 lg:gap-6">
            <ComparisonCell
              side="primary"
              label={rangeText(primaryRange)}
              instance={instance}
              def={def}
              base={primary}
              onSizeChange={(size) => onSaveInstanceSize(instance.instanceId, size)}
              onHide={() => onHideInstance(instance.instanceId)}
            />
            <ComparisonCell
              side="compare"
              label={rangeText(compareRange)}
              instance={instance}
              def={def}
              base={{ ...primary, range: compareRange }}
              onSizeChange={(size) => onSaveInstanceSize(instance.instanceId, size)}
              onHide={() => onHideInstance(instance.instanceId)}
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
  onSizeChange,
  onHide,
}: {
  side: "primary" | "compare";
  label: string;
  instance: DashboardWidgetEntry["instance"];
  def: DashboardWidgetEntry["def"];
  base: WidgetContext;
  onSizeChange: (size: "compact" | "expanded") => Promise<void>;
  onHide: () => Promise<void>;
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
        onSizeChange={onSizeChange}
        onHide={onHide}
      />
    </section>
  );
}
