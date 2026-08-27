"use client";

import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import {
  budgetComparison,
  budgetPace,
  categoryBreakdown,
  categoryBreakdownMonthlyAverage,
  categoryTrendSeries,
  comparePeriodSummary,
  containerFlows,
  dailySpend,
  goalBasis,
  goalProgress,
  investmentReport,
  largestTransactions,
  overallBalanceSeries,
  precedingRange,
  requiredMonthly,
  recentRows,
  sankeyFlows,
  topPayees,
  totalExpenseBudgetOnDate,
  trailingDays,
  waterfallData,
  type InvestmentReport,
} from "@/core/engine";
import type { Transaction } from "@/core/model";
import { categoryColorFor } from "@/features/category-color";
import { ledgerHref } from "@/features/ledger/deep-link";
import { Figure, Marginalia, Money } from "@/features/ui";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyNote } from "./chart-ui";
import {
  BudgetPaceMeter,
  GoalsRail,
  LargestList,
  MoneyFlowChart,
  PayeeList,
  RecentEntriesList,
  SpendingCalendar,
  UpcomingList,
  spendByDay,
} from "./dashboard-widgets";
import {
  BudgetComparisonTable,
  CategoryDoughnut,
  ContainerFlowsTable,
  InvestmentCard,
  MonthlyBarsChart,
  WaterfallChart,
} from "./widgets";
import { rangeText, type WidgetContext } from "./registry";

/**
 * ── The dashboard as a LIST, not a layout ───────────────────────────────────
 *
 * Every widget is one self-contained entry the dashboard maps over. The synced
 * layout references stable ids; each id also keys collapse, per-widget period
 * (§6.1), and the error boundary.
 *
 * A widget receives its window, never the global one: `range` is already resolved
 * to whatever this widget is showing. Each `render` returns a COMPONENT, so the
 * widget owns its own memoised derivations — hooks written inline here would
 * belong to the dashboard and break the moment the list is reordered.
 */

const monthLabelFmt = new Intl.DateTimeFormat("en-US", { month: "long" });

// ── Hero: what the period kept ───────────────────────────────────────────────

const BALANCE_CURVE_DAYS = 90;

function BalanceFigure({
  today,
  containers,
  ledgerTransactions,
  aggregates,
  overallBalanceCurve,
}: WidgetContext) {
  const balance = aggregates.balance();
  const curve = useMemo(
    () =>
      overallBalanceCurve ??
      overallBalanceSeries(
        ledgerTransactions,
        containers,
        trailingDays(today, BALANCE_CURVE_DAYS),
      ),
    [ledgerTransactions, containers, overallBalanceCurve, today],
  );
  return (
    <Figure
      label="Overall balance"
      showLabel={false}
      className="pt-0"
      cents={balance}
      series={recentRows(ledgerTransactions, 1).length > 0 ? curve : undefined}
    />
  );
}

function SavedFigure({
  range,
  categories,
  reportTransactions,
  aggregates,
}: WidgetContext) {
  const monthly = aggregates.monthly(range);
  const summary = aggregates.period(range);
  const delta = useMemo(() => {
    const before = precedingRange(range);
    if (!before) return null;
    return comparePeriodSummary(summary, aggregates.period(before));
  }, [summary, aggregates, range]);

  const curve = useMemo(() => {
    const values = monthly.map((m) => m.savings);
    return values.length > 1 && values.some((v) => v !== 0) ? values : undefined;
  }, [monthly]);

  const rate = summary.savingsRate;
  const note = [
    rate === null ? null : `${Math.round(rate * 100)}% of what you earned`,
    delta?.savedPct == null
      ? null
      : `${delta.savedPct >= 0 ? "up" : "down"} ${Math.abs(Math.round(delta.savedPct))}% on the period before`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Figure
      label="Saved this period"
      cents={summary.saved}
      // A month of savings is the ground under "saved this period" — same unit
      // as the figure, so the curve and the number say one thing. Omitted when
      // there is nothing to draw: a flat line at zero is not a story.
      series={curve}
    >
      <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="text-foreground/70 font-medium">{rangeText(range)}</span>
        <span>
          <Money cents={summary.income} tone="in" /> in
        </span>
        <span>
          <Money cents={summary.expense} className="text-foreground" /> out
        </span>
      </div>
      {note && <Marginalia className="mt-1.5 text-sm">{note}</Marginalia>}
    </Figure>
  );
}

// ── Budget pace ──────────────────────────────────────────────────────────────

function Pace({ today, categories, reportTransactions, budgetTargets }: WidgetContext) {
  const yearMonth = today.slice(0, 7);
  const pace = useMemo(
    () => budgetPace(reportTransactions, categories, budgetTargets, yearMonth, today),
    [reportTransactions, categories, budgetTargets, yearMonth, today],
  );
  const month = monthLabelFmt.format(new Date(`${yearMonth}-01T00:00:00`));
  return <BudgetPaceMeter pace={pace} monthLabel={month} />;
}

// ── Money flow ───────────────────────────────────────────────────────────────

function Flow({ range, categories, reportTransactions }: WidgetContext) {
  const flows = useMemo(
    () => sankeyFlows(reportTransactions, categories, range),
    [reportTransactions, categories, range],
  );
  return (
    <MoneyFlowChart flows={flows} colorOf={(id) => categoryColorFor(id, categories)} />
  );
}

// ── Spending calendar ────────────────────────────────────────────────────────

/** Eight weeks: long enough to show a rhythm, short enough that the grid stays a
 *  panel rather than a page. */
const CALENDAR_DAYS = 56;

function Calendar({ range, today, categories, reportTransactions }: WidgetContext) {
  const { days, spend } = useMemo(() => {
    const end = range.end ?? today;
    const axis = trailingDays(end, CALENDAR_DAYS);
    const window = { start: axis[0] ?? end, end };
    return {
      days: axis,
      spend: spendByDay(dailySpend(reportTransactions, categories, window)),
    };
  }, [range, today, categories, reportTransactions]);
  // No marginalia here on purpose: the grid's own footer already names the months
  // it covers, and §12.3 caps a screen at two asides before they read as labels.
  // This screen spends both on the hero and on budget pace.
  return (
    <SpendingCalendar
      days={days}
      spend={spend}
      hrefFor={(day) => ledgerHref({ range: { start: day, end: day } })}
    />
  );
}

// ── Where it went ────────────────────────────────────────────────────────────

function Breakdown({ range, categories, reportTransactions }: WidgetContext) {
  const [mode, setMode] = useState<"total" | "avg">("total");

  const slices = useMemo(
    () => ({
      expense:
        mode === "avg"
          ? categoryBreakdownMonthlyAverage(reportTransactions, categories, range, {
              type: "expense",
            })
          : categoryBreakdown(reportTransactions, categories, range, {
              type: "expense",
            }),
      income:
        mode === "avg"
          ? categoryBreakdownMonthlyAverage(reportTransactions, categories, range, {
              type: "income",
            })
          : categoryBreakdown(reportTransactions, categories, range, { type: "income" }),
    }),
    [reportTransactions, categories, range, mode],
  );

  // The sparkline always shows the real month-by-month shape, whichever way the
  // totals beside it are expressed — a monthly average has no shape of its own.
  const trends = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const type of ["expense", "income"] as const) {
      for (const t of categoryTrendSeries(reportTransactions, categories, range, {
        type,
      })) {
        map.set(t.categoryId, t.series);
      }
    }
    return map;
  }, [reportTransactions, categories, range]);

  return (
    <div className="space-y-6">
      <ToggleGroup
        type="single"
        size="sm"
        value={mode}
        onValueChange={(v) => v && setMode(v as "total" | "avg")}
        className="rounded-full"
      >
        <ToggleGroupItem value="total" className="rounded-full px-3 text-xs">
          Total
        </ToggleGroupItem>
        <ToggleGroupItem value="avg" className="rounded-full px-3 text-xs">
          Monthly avg
        </ToggleGroupItem>
      </ToggleGroup>
      <div>
        <p className="eyebrow text-muted-foreground mb-3">Expenses</p>
        <CategoryDoughnut
          slices={slices.expense}
          trends={trends}
          emptyLabel="No spending in this period."
          hrefFor={(id) => ledgerHref({ categoryIds: [id], range })}
          colorOf={(id) => categoryColorFor(id, categories)}
        />
      </div>
      <div>
        <p className="eyebrow text-muted-foreground mb-3">Income</p>
        <CategoryDoughnut
          slices={slices.income}
          trends={trends}
          emptyLabel="No income in this period."
          hrefFor={(id) => ledgerHref({ categoryIds: [id], range })}
          colorOf={(id) => categoryColorFor(id, categories)}
        />
      </div>
    </div>
  );
}

// ── The lists ────────────────────────────────────────────────────────────────

function Payees({ range, categories, reportTransactions }: WidgetContext) {
  const payees = useMemo(
    () => topPayees(reportTransactions, categories, range, 6),
    [reportTransactions, categories, range],
  );
  return (
    <PayeeList payees={payees} hrefFor={(payee) => ledgerHref({ text: payee, range })} />
  );
}

function Largest({ range, categories, reportTransactions }: WidgetContext) {
  const rows = useMemo(
    () => largestTransactions(reportTransactions, range, 6),
    [reportTransactions, range],
  );
  const nameOf = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : "Transfer");
  }, [categories]);
  return (
    <LargestList
      rows={rows}
      nameOf={nameOf}
      hrefFor={(t) => ledgerHref({ focus: t.id })}
      colorOf={(id) => categoryColorFor(id, categories)}
    />
  );
}

function Recent(context: WidgetContext) {
  return <RecentReport {...context} limit={8} />;
}

function RecentCompact(context: WidgetContext) {
  return <RecentReport {...context} limit={3} />;
}

function RecentReport({
  categories,
  containers,
  ledgerTransactions,
  limit,
}: WidgetContext & { limit?: number }) {
  const rows = useMemo(
    () => recentRows(ledgerTransactions, limit),
    [ledgerTransactions, limit],
  );
  const detailOf = useMemo(() => {
    const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
    const containerNames = new Map(containers.map((c) => [c.id, c.name]));
    return (t: Transaction) =>
      t.to_container_id
        ? `${containerNames.get(t.container_id) ?? "Unknown"} → ${containerNames.get(t.to_container_id) ?? "Unknown"}`
        : (categoryNames.get(t.category_id ?? "") ?? "Unknown");
  }, [categories, containers]);
  return (
    <RecentEntriesList
      rows={rows}
      detailOf={detailOf}
      hrefFor={(t) => ledgerHref({ focus: t.id })}
      colorOf={(id) => categoryColorFor(id, categories)}
    />
  );
}

/** How far ahead "coming up" looks. A month is what a commitment list is for. */
const UPCOMING_DAYS = 30;

function Upcoming({ today, aggregates }: WidgetContext) {
  const rows = useMemo(() => {
    // Calendar arithmetic, like every other date in this app — a month ahead is
    // not `today + 30 × 86400000` on the two days a year the clocks move.
    const until = format(
      addDays(new Date(`${today}T00:00:00`), UPCOMING_DAYS),
      "yyyy-MM-dd",
    );
    return aggregates
      .occurrences(today, until)
      .slice(0, 8)
      .map((o) => ({
        key: `${o.rule.id}:${o.date}`,
        date: o.date,
        name: o.rule.template_vendor_source,
        amount: o.amount,
      }));
  }, [today, aggregates]);
  return <UpcomingList rows={rows} />;
}

function Goals({ today, ledgerTransactions, goals, goalFacts }: WidgetContext) {
  const rows = useMemo(
    () =>
      goals
        .filter((g) => g.status === "active" && !g.is_archived)
        .map((g) => {
          const ledger = goalFacts?.get(g.id) ?? ledgerTransactions;
          return {
            id: g.id,
            name: g.name ?? "Goal",
            basis: goalBasis(g, ledger),
            target: g.target_amount,
            progress: goalProgress(g, ledger),
            monthly: requiredMonthly(g, ledger, today),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1)),
    [goalFacts, goals, ledgerTransactions, today],
  );
  return <GoalsRail goals={rows} />;
}

// ── The M5 charts, unchanged in substance ────────────────────────────────────

function Monthly({ range, categories, budgetTargets, aggregates }: WidgetContext) {
  const monthly = useMemo(() => {
    const base = aggregates.monthly(range);
    return base.map((m) => ({
      ...m,
      budget: totalExpenseBudgetOnDate(budgetTargets, categories, `${m.month}-01`),
    }));
  }, [aggregates, categories, budgetTargets, range]);
  return <MonthlyBarsChart monthly={monthly} />;
}

function Waterfall({ range, aggregates }: WidgetContext) {
  const w = useMemo(() => waterfallData(aggregates.monthly(range)), [aggregates, range]);
  return <WaterfallChart income={w.income} expenses={w.expenses} savings={w.savings} />;
}

function Flows({ range, containers, ledgerTransactions }: WidgetContext) {
  const flows = useMemo(
    () => containerFlows(ledgerTransactions, containers, range),
    [ledgerTransactions, containers, range],
  );
  return <ContainerFlowsTable flows={flows} />;
}

function Investments({
  range,
  containers,
  ledgerTransactions,
  snapshots,
}: WidgetContext) {
  const reports = useMemo<InvestmentReport[]>(
    () =>
      containers
        .filter((c) => c.is_investment && !c.is_archived)
        .map((c) => investmentReport(c, snapshots, ledgerTransactions, range)),
    [containers, snapshots, ledgerTransactions, range],
  );

  if (reports.length === 0)
    return <EmptyNote>No containers are tracked as investments.</EmptyNote>;
  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <InvestmentCard key={r.containerId} report={r} />
      ))}
    </div>
  );
}

function Budgets({
  range,
  categories,
  reportTransactions,
  budgetTargets,
}: WidgetContext) {
  const rows = useMemo(
    () => budgetComparison(reportTransactions, categories, range, budgetTargets),
    [reportTransactions, categories, range, budgetTargets],
  );
  return (
    <BudgetComparisonTable
      rows={rows}
      colorOf={(id) => categoryColorFor(id, categories)}
    />
  );
}

/** Render implementations stay behind dynamic imports in the metadata registry. */
export const LEGACY_WIDGET_RENDERERS = {
  balance: BalanceFigure,
  pace: Pace,
  recent: Recent,
  saved: SavedFigure,
  flow: Flow,
  calendar: Calendar,
  breakdown: Breakdown,
  payees: Payees,
  upcoming: Upcoming,
  largest: Largest,
  goals: Goals,
  monthly: Monthly,
  waterfall: Waterfall,
  flows: Flows,
  investments: Investments,
  budgets: Budgets,
};

export const LEGACY_COMPACT_RENDERERS = { recent: RecentCompact };
