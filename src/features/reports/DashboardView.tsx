"use client";

import { useEffect, useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { addDays, format, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  budgetTargetsAtom,
  categoriesAtom,
  containerFactsAtom,
  containersAtom,
  cravingWinsAtom,
  dispatchManyAtom,
  flashRowAtom,
  goalsAtom,
  goalFactsAtom,
  ledgerCountAtom,
  ledgerRevisionAtom,
  pendingEntriesAtom,
  readApprovedTransactionRange,
  readLedgerEntriesById,
  readLedgerPage,
  readLedgerRange,
  readOverallBalanceSeries,
  readyAtom,
  recurringRulesAtom,
  snapshotsAtom,
  settingsAtom,
} from "@/features/store";
import {
  resolvePeriod,
  precedingRange,
  statsTransactions,
  trailingDays,
  type DateRange,
  type ReportingPeriod,
} from "@/core/engine";
import { newId, type Transaction } from "@/core/model";
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
  const containerFacts = useAtomValue(containerFactsAtom);
  const cravingWins = useAtomValue(cravingWinsAtom);
  const budgetTargets = useAtomValue(budgetTargetsAtom);
  const snapshots = useAtomValue(snapshotsAtom);
  const recurringRules = useAtomValue(recurringRulesAtom);
  const goals = useAtomValue(goalsAtom);
  const goalFacts = useAtomValue(goalFactsAtom);
  const ledgerCount = useAtomValue(ledgerCountAtom);
  const revision = useAtomValue(ledgerRevisionAtom);
  const pendingEntries = useAtomValue(pendingEntriesAtom);
  const settings = useAtomValue(settingsAtom);
  const dispatchOps = useSetAtom(dispatchManyAtom);
  const flashRow = useSetAtom(flashRowAtom);
  // `today` is stable for the session's render; `core` stays clock-free.
  const today = useMemo(() => todayIso(), []);
  const overviewCuration = useMemo(() => {
    const hasExpenseBudget = budgetTargets.length > 0;
    const hasActiveGoal = goals.some(
      (goal) => goal.status === "active" && !goal.is_archived,
    );
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
      hasLandingHistory: false,
      hasLandingSignal:
        ledgerCount > 0 || recurringRules.some((rule) => rule.status === "active"),
      hasCravingWins: cravingWins.length > 0,
    });
  }, [budgetTargets.length, categories, cravingWins.length, goals, ledgerCount, recurringRules]);

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
  const queryBounds = useMemo(() => {
    const fixedStart = format(subMonths(new Date(`${today}T00:00:00`), 6), "yyyy-MM-01");
    const priorPrimary = precedingRange(primaryRange);
    const priorCompare = compareRange ? precedingRange(compareRange) : null;
    const ranges = [primaryRange, compareRange, priorPrimary, priorCompare].filter(
      (range): range is DateRange => range !== null,
    );
    const allTime = ranges.some((range) => range.start === null);
    const starts = ranges.flatMap((range) => (range.start ? [range.start] : []));
    const ends = ranges.flatMap((range) => (range.end ? [range.end] : []));
    const futureEnd = format(addDays(new Date(`${today}T00:00:00`), 60), "yyyy-MM-dd");
    return {
      start: allTime ? "0000-01-01" : [fixedStart, ...starts].sort()[0],
      end: [futureEnd, ...ends].sort().at(-1)!,
      futureEnd,
    };
  }, [compareRange, primaryRange, today]);
  const cravingTransferIds = useMemo(
    () =>
      cravingWins.flatMap((win) =>
        win.transfer_transaction_id ? [win.transfer_transaction_id] : [],
      ),
    [cravingWins],
  );
  const reportKey = `${revision}:${queryBounds.start}:${queryBounds.end}`;
  const [reportRead, setReportRead] = useState<{
    key: string;
    transactions: Transaction[];
    balancesAsOfToday: Map<string, number>;
    curve: number[];
  } | null>(null);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const countedIds = containers
      .filter(
        (container) => container.include_in_overall_balance && !container.is_archived,
      )
      .map((container) => container.id);
    void Promise.all([
      readLedgerRange(queryBounds.start, queryBounds.end),
      readApprovedTransactionRange(today, queryBounds.futureEnd),
      readLedgerPage({ sort: "newest", limit: 8, cursor: null }),
      readLedgerEntriesById(cravingTransferIds),
      readOverallBalanceSeries(countedIds, trailingDays(today, 90)),
      Promise.all(
        containers.map(async (container) => [
          container.id,
          (await readOverallBalanceSeries([container.id], [today]))[0] ?? 0,
        ] as const),
      ),
    ]).then(([rangeRows, futureRows, recent, cravingRows, curve, balances]) => {
      if (!active) return;
      const byId = new Map(
        [...rangeRows, ...futureRows, ...recent.rows, ...cravingRows, ...pendingEntries].map(
          (row) => [row.id, row],
        ),
      );
      setReportRead({
        key: reportKey,
        transactions: [...byId.values()],
        balancesAsOfToday: new Map(balances),
        curve,
      });
    });
    return () => {
      active = false;
    };
  }, [
    containers,
    cravingTransferIds,
    pendingEntries,
    queryBounds,
    ready,
    reportKey,
    revision,
    today,
  ]);
  const currentReportRead = reportRead?.key === reportKey ? reportRead : null;
  const data = useMemo(() => {
    if (!currentReportRead) return null;
    const reportTransactions = statsTransactions(
      currentReportRead.transactions,
      categories,
    );
    const currentBalances = new Map(
      [...containerFacts].map(([id, fact]) => [id, fact.balance]),
    );
    return {
      today,
      categories,
      containers,
      cravingWins,
      ledgerTransactions: currentReportRead.transactions,
      reportTransactions,
      budgetTargets,
      snapshots,
      recurringRules,
      goals,
      currentBalances,
      goalFacts,
      overallBalanceCurve: currentReportRead.curve,
      syncedSettings: settings,
      dispatchOps,
      aggregates: createDashboardAggregates({
        budgetTargets,
        categories,
        containers,
        ledgerTransactions: currentReportRead.transactions,
        reportTransactions,
        recurringRules,
        snapshots,
        goals,
        currentBalances,
        balancesAsOfToday: currentReportRead.balancesAsOfToday,
        goalFacts,
      }),
    };
  }, [
    budgetTargets,
    categories,
    containerFacts,
    containers,
    cravingWins,
    dispatchOps,
    goalFacts,
    goals,
    recurringRules,
    currentReportRead,
    settings,
    snapshots,
    today,
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

      {!ready || !data ? (
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
      {data && (
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
      )}
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
    <div className="grid gap-6 md:grid-cols-2">
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
    <div className="space-y-6">
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
          <div key={instance.instanceId} className="grid gap-6 lg:grid-cols-2">
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
