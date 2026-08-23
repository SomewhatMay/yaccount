"use client";

import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import {
  budgetComparison,
  budgetPace,
  categoryBreakdown,
  categoryBreakdownMonthlyAverage,
  categoryMonthlySpend,
  categoryTrendSeries,
  comparePeriodSummary,
  containerFlows,
  dailySpend,
  goalBasis,
  goalProgress,
  investmentReport,
  largestTransactions,
  monthlyTotals,
  overallBalance,
  overallBalanceSeries,
  overallBalanceAsOf,
  periodSummary,
  precedingRange,
  requiredMonthly,
  recentRows,
  sankeyFlows,
  savingsRateSeries,
  topPayees,
  totalExpenseBudgetOnDate,
  trailingDays,
  upcomingOccurrences,
  waterfallData,
  type DateRange,
  type InvestmentReport,
} from "@/core/engine";
import type {
  BudgetTarget,
  Category,
  Container,
  ContainerSnapshot,
  Goal,
  RecurringRule,
  Transaction,
} from "@/core/model";
import { categoryColorFor } from "@/features/category-color";
import { ledgerHref } from "@/features/ledger/deep-link";
import { Figure, Marginalia, Money } from "@/features/ui";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyNote } from "./chart-ui";
import {
  BudgetPaceMeter,
  GoalsRail,
  KpiStrip,
  LargestList,
  MoneyFlowChart,
  PayeeList,
  RecentEntriesList,
  SpendingCalendar,
  UpcomingList,
  spendByDay,
  type Kpi,
} from "./dashboard-widgets";
import {
  BudgetComparisonTable,
  CategoryDoughnut,
  CategoryDrilldown,
  ContainerFlowsTable,
  InvestmentCard,
  MonthlyBarsChart,
  WaterfallChart,
} from "./widgets";

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

export interface WidgetContext {
  /** The window this widget is showing — the dashboard's, or its own override. */
  range: DateRange;
  today: string;
  categories: Category[];
  containers: Container[];
  transactions: Transaction[];
  budgetTargets: BudgetTarget[];
  snapshots: ContainerSnapshot[];
  recurringRules: RecurringRule[];
  goals: Goal[];
}

export interface WidgetDef {
  /** Stable forever: it is a stored preference key, not a label. */
  id: string;
  title: string;
  /** Plain-language recognition copy for the Add widgets gallery. */
  description: string;
  defaultVisible: boolean;
  /** No panel, no collapse — the screen's own opening figure. */
  bare?: boolean;
  /** Its window is fixed by what it MEANS (this month; the next 30 days), so a
   *  period override would be a menu that lies about what it does. */
  fixedWindow?: boolean;
  render: (ctx: WidgetContext) => React.ReactNode;
}

const monthLabelFmt = new Intl.DateTimeFormat("en-US", { month: "long" });
const rangeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** A window in words, for the widget that has to say which one it is showing. */
export function rangeText(r: DateRange): string {
  if (r.start === null && r.end === null) return "All time";
  const f = (iso: string) => rangeFmt.format(new Date(`${iso}T00:00:00`));
  return `${r.start ? f(r.start) : "…"} – ${r.end ? f(r.end) : "…"}`;
}

// ── Hero: what the period kept ───────────────────────────────────────────────

const BALANCE_CURVE_DAYS = 90;

function BalanceFigure({ today, containers, transactions }: WidgetContext) {
  const balance = useMemo(
    () => overallBalance(transactions, containers),
    [transactions, containers],
  );
  const curve = useMemo(
    () =>
      overallBalanceSeries(
        transactions,
        containers,
        trailingDays(today, BALANCE_CURVE_DAYS),
      ),
    [transactions, containers, today],
  );
  return (
    <Figure
      label="Overall balance"
      cents={balance}
      series={recentRows(transactions, 1).length > 0 ? curve : undefined}
    />
  );
}

function SavedFigure({ range, categories, transactions }: WidgetContext) {
  const monthly = useMemo(
    () => monthlyTotals(transactions, categories, range),
    [transactions, categories, range],
  );
  const summary = useMemo(
    () => periodSummary(transactions, categories, range),
    [transactions, categories, range],
  );
  const delta = useMemo(() => {
    const before = precedingRange(range);
    if (!before) return null;
    return comparePeriodSummary(summary, periodSummary(transactions, categories, before));
  }, [summary, transactions, categories, range]);

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

// ── The KPI strip ────────────────────────────────────────────────────────────

function Kpis({ range, today, categories, containers, transactions }: WidgetContext) {
  const { kpis, note } = useMemo(() => {
    const before = precedingRange(range);
    const current = periodSummary(transactions, categories, range);
    const previous = before ? periodSummary(transactions, categories, before) : null;
    const delta = previous ? comparePeriodSummary(current, previous) : null;

    const asOf = range.end ?? today;
    const balance = overallBalanceAsOf(transactions, containers, asOf);
    const balanceBefore = before
      ? overallBalanceAsOf(transactions, containers, before.end!)
      : null;

    const rates = savingsRateSeries(monthlyTotals(transactions, categories, range))
      .map((r) => r.rate)
      .filter((r): r is number => r !== null);

    const list: Kpi[] = [
      {
        id: "in",
        label: "In",
        value: <Money cents={current.income} tone="in" />,
        delta: delta?.incomePct ?? null,
      },
      {
        id: "out",
        label: "Out",
        value: <Money cents={current.expense} />,
        delta: delta?.expensePct ?? null,
      },
      {
        id: "rate",
        label: "Savings rate",
        value: (
          <span className="tnum font-mono">
            {current.savingsRate === null
              ? "—"
              : `${Math.round(current.savingsRate * 100)}%`}
          </span>
        ),
        delta: delta?.ratePoints ?? null,
        unit: "pts",
        spark: rates,
      },
      {
        id: "balance",
        label: "Balance",
        value: <Money cents={balance} tone={balance < 0 ? "alert" : "neutral"} />,
        delta:
          balanceBefore === null || balanceBefore === 0
            ? null
            : ((balance - balanceBefore) / Math.abs(balanceBefore)) * 100,
      },
    ];
    return {
      kpis: list,
      note: before
        ? `Compared with ${rangeText(before).toLowerCase()}, the window of the same length before this one.`
        : undefined,
    };
  }, [range, today, categories, containers, transactions]);

  return <KpiStrip kpis={kpis} note={note} />;
}

// ── Budget pace ──────────────────────────────────────────────────────────────

function Pace({ today, categories, transactions, budgetTargets }: WidgetContext) {
  const yearMonth = today.slice(0, 7);
  const pace = useMemo(
    () => budgetPace(transactions, categories, budgetTargets, yearMonth, today),
    [transactions, categories, budgetTargets, yearMonth, today],
  );
  const month = monthLabelFmt.format(new Date(`${yearMonth}-01T00:00:00`));
  return <BudgetPaceMeter pace={pace} monthLabel={month} />;
}

// ── Money flow ───────────────────────────────────────────────────────────────

function Flow({ range, categories, transactions }: WidgetContext) {
  const flows = useMemo(
    () => sankeyFlows(transactions, categories, range),
    [transactions, categories, range],
  );
  return (
    <MoneyFlowChart flows={flows} colorOf={(id) => categoryColorFor(id, categories)} />
  );
}

// ── Spending calendar ────────────────────────────────────────────────────────

/** Eight weeks: long enough to show a rhythm, short enough that the grid stays a
 *  panel rather than a page. */
const CALENDAR_DAYS = 56;

function Calendar({ range, today, categories, transactions }: WidgetContext) {
  const { days, spend } = useMemo(() => {
    const end = range.end ?? today;
    const axis = trailingDays(end, CALENDAR_DAYS);
    const window = { start: axis[0] ?? end, end };
    return {
      days: axis,
      spend: spendByDay(dailySpend(transactions, categories, window)),
    };
  }, [range, today, categories, transactions]);
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

function Breakdown({ range, categories, transactions }: WidgetContext) {
  const [mode, setMode] = useState<"total" | "avg">("total");

  const slices = useMemo(
    () => ({
      expense:
        mode === "avg"
          ? categoryBreakdownMonthlyAverage(transactions, categories, range, {
              type: "expense",
            })
          : categoryBreakdown(transactions, categories, range, { type: "expense" }),
      income:
        mode === "avg"
          ? categoryBreakdownMonthlyAverage(transactions, categories, range, {
              type: "income",
            })
          : categoryBreakdown(transactions, categories, range, { type: "income" }),
    }),
    [transactions, categories, range, mode],
  );

  // The sparkline always shows the real month-by-month shape, whichever way the
  // totals beside it are expressed — a monthly average has no shape of its own.
  const trends = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const type of ["expense", "income"] as const) {
      for (const t of categoryTrendSeries(transactions, categories, range, { type })) {
        map.set(t.categoryId, t.series);
      }
    }
    return map;
  }, [transactions, categories, range]);

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

function Payees({ range, categories, transactions }: WidgetContext) {
  const payees = useMemo(
    () => topPayees(transactions, categories, range, 6),
    [transactions, categories, range],
  );
  return (
    <PayeeList payees={payees} hrefFor={(payee) => ledgerHref({ text: payee, range })} />
  );
}

function Largest({ range, categories, transactions }: WidgetContext) {
  const rows = useMemo(
    () => largestTransactions(transactions, range, 6),
    [transactions, range],
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

function Recent({ categories, containers, transactions }: WidgetContext) {
  const rows = useMemo(() => recentRows(transactions), [transactions]);
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

function Upcoming({ today, recurringRules }: WidgetContext) {
  const rows = useMemo(() => {
    // Calendar arithmetic, like every other date in this app — a month ahead is
    // not `today + 30 × 86400000` on the two days a year the clocks move.
    const until = format(
      addDays(new Date(`${today}T00:00:00`), UPCOMING_DAYS),
      "yyyy-MM-dd",
    );
    return upcomingOccurrences(recurringRules, today, until, { limit: 8 }).map((o) => ({
      key: `${o.rule.id}:${o.date}`,
      date: o.date,
      name: o.rule.template_vendor_source,
      amount: o.amount,
    }));
  }, [today, recurringRules]);
  return <UpcomingList rows={rows} />;
}

function Goals({ today, transactions, goals }: WidgetContext) {
  const rows = useMemo(
    () =>
      goals
        .filter((g) => g.status === "active" && !g.is_archived)
        .map((g) => ({
          id: g.id,
          name: g.name ?? "Goal",
          basis: goalBasis(g, transactions),
          target: g.target_amount,
          progress: goalProgress(g, transactions),
          monthly: requiredMonthly(g, transactions, today),
        }))
        .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1)),
    [goals, transactions, today],
  );
  return <GoalsRail goals={rows} />;
}

// ── The M5 charts, unchanged in substance ────────────────────────────────────

function Monthly({ range, categories, transactions, budgetTargets }: WidgetContext) {
  const monthly = useMemo(() => {
    const base = monthlyTotals(transactions, categories, range);
    return base.map((m) => ({
      ...m,
      budget: totalExpenseBudgetOnDate(budgetTargets, categories, `${m.month}-01`),
    }));
  }, [transactions, categories, budgetTargets, range]);
  return <MonthlyBarsChart monthly={monthly} />;
}

function Waterfall({ range, categories, transactions }: WidgetContext) {
  const w = useMemo(
    () => waterfallData(monthlyTotals(transactions, categories, range)),
    [transactions, categories, range],
  );
  return <WaterfallChart income={w.income} expenses={w.expenses} savings={w.savings} />;
}

function Trend({ range, categories, transactions, budgetTargets }: WidgetContext) {
  const [selected, setSelected] = useState<string | null>(null);
  const series = useMemo(
    () =>
      selected ? categoryMonthlySpend(transactions, selected, range, budgetTargets) : [],
    [transactions, selected, range, budgetTargets],
  );
  return (
    <CategoryDrilldown
      categories={categories}
      selectedId={selected}
      onSelect={setSelected}
      series={series}
    />
  );
}

function Flows({ range, containers, transactions }: WidgetContext) {
  const flows = useMemo(
    () => containerFlows(transactions, containers, range),
    [transactions, containers, range],
  );
  return <ContainerFlowsTable flows={flows} />;
}

function Investments({ range, containers, transactions, snapshots }: WidgetContext) {
  const reports = useMemo<InvestmentReport[]>(
    () =>
      containers
        .filter((c) => c.is_investment && !c.is_archived)
        .map((c) => investmentReport(c, snapshots, transactions, range)),
    [containers, snapshots, transactions, range],
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

function Budgets({ range, categories, transactions, budgetTargets }: WidgetContext) {
  const rows = useMemo(
    () => budgetComparison(transactions, categories, range, budgetTargets),
    [transactions, categories, range, budgetTargets],
  );
  return (
    <BudgetComparisonTable
      rows={rows}
      colorOf={(id) => categoryColorFor(id, categories)}
    />
  );
}

// ── The list itself ──────────────────────────────────────────────────────────

/** Default order. The synced layout may reorder or hide these stable ids. */
export const DASHBOARD_WIDGETS: WidgetDef[] = [
  {
    id: "balance",
    title: "Overall balance",
    description: "Current total across every counted container.",
    defaultVisible: true,
    bare: true,
    fixedWindow: true,
    render: (ctx) => <BalanceFigure {...ctx} />,
  },
  {
    id: "pace",
    title: "Budget pace",
    description: "Spending against allowances as this month unfolds.",
    defaultVisible: true,
    fixedWindow: true,
    render: (ctx) => <Pace {...ctx} />,
  },
  {
    id: "recent",
    title: "Recent entries",
    description: "The latest approved entries across the ledger.",
    defaultVisible: true,
    fixedWindow: true,
    render: (ctx) => <Recent {...ctx} />,
  },
  {
    id: "saved",
    title: "Saved this period",
    description: "Income left after expenses in the selected period.",
    defaultVisible: true,
    render: (ctx) => <SavedFigure {...ctx} />,
  },
  {
    id: "kpis",
    title: "Headline figures",
    description: "Income, spending, savings rate, and ending balance at a glance.",
    defaultVisible: true,
    bare: true,
    render: (ctx) => <Kpis {...ctx} />,
  },
  {
    id: "flow",
    title: "Money flow",
    description: "How income moved through categories and into savings.",
    defaultVisible: true,
    render: (ctx) => <Flow {...ctx} />,
  },
  {
    id: "calendar",
    title: "Spending calendar",
    description: "Daily spending rhythm across the latest eight weeks.",
    defaultVisible: true,
    render: (ctx) => <Calendar {...ctx} />,
  },
  {
    id: "breakdown",
    title: "Where it went",
    description: "Income and expenses by category, with recent trends.",
    defaultVisible: true,
    render: (ctx) => <Breakdown {...ctx} />,
  },
  {
    id: "payees",
    title: "Top payees",
    description: "The largest destinations for spending in the selected period.",
    defaultVisible: true,
    render: (ctx) => <Payees {...ctx} />,
  },
  {
    id: "upcoming",
    title: "Coming up",
    description: "Recurring income and bills due in the next 30 days.",
    defaultVisible: true,
    fixedWindow: true,
    render: (ctx) => <Upcoming {...ctx} />,
  },
  {
    id: "largest",
    title: "Largest entries",
    description: "The highest-value entries in the selected period.",
    defaultVisible: true,
    render: (ctx) => <Largest {...ctx} />,
  },
  {
    id: "goals",
    title: "Goals",
    description: "Progress and monthly asks for active goals.",
    defaultVisible: true,
    render: (ctx) => <Goals {...ctx} />,
  },
  {
    id: "monthly",
    title: "Month by month",
    description: "Income, expenses, savings, and budget over time.",
    defaultVisible: true,
    render: (ctx) => <Monthly {...ctx} />,
  },
  {
    id: "waterfall",
    title: "Income → expenses → savings",
    description: "How the period's income became spending and savings.",
    defaultVisible: true,
    render: (ctx) => <Waterfall {...ctx} />,
  },
  {
    id: "trend",
    title: "Category over time",
    description: "One category's monthly spending against its budget.",
    defaultVisible: true,
    render: (ctx) => <Trend {...ctx} />,
  },
  {
    id: "flows",
    title: "Container flows",
    description: "Money transferred into and out of each container.",
    defaultVisible: true,
    render: (ctx) => <Flows {...ctx} />,
  },
  {
    id: "investments",
    title: "Investments",
    description: "Value, contributions, and gain or loss for each investment.",
    defaultVisible: true,
    render: (ctx) => <Investments {...ctx} />,
  },
  {
    id: "budgets",
    title: "Budget comparison",
    description: "Average spending against allowances by category.",
    defaultVisible: true,
    render: (ctx) => <Budgets {...ctx} />,
  },
];

/** The month a pace widget is about, for its title. */
export function paceTitle(today: string): string {
  return `Budget pace — ${monthLabelFmt.format(new Date(`${today.slice(0, 7)}-01T00:00:00`))}`;
}
