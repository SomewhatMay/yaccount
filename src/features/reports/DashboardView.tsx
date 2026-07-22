"use client";

import { useMemo, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  budgetTargetsAtom,
  categoriesAtom,
  comparePeriodAtom,
  containersAtom,
  readyAtom,
  reportingPeriodAtom,
  snapshotsAtom,
  transactionsAtom,
} from "@/features/store";
import {
  budgetComparison,
  categoryBreakdown,
  categoryBreakdownMonthlyAverage,
  categoryMonthlySpend,
  containerFlows,
  monthlyTotals,
  monthKeysInRange,
  netContributions,
  reconstructedBalance,
  resolvePeriod,
  totalExpenseBudgetOnDate,
  unrealizedGainLoss,
  waterfallData,
  type DateRange,
  type ReportingPeriod,
} from "@/core/engine";
import { formatCents } from "@/core/money";
import type {
  BudgetTarget,
  Category,
  Container,
  ContainerSnapshot,
  Transaction,
} from "@/core/model";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PeriodPicker } from "./PeriodPicker";
import { Panel } from "./chart-ui";
import {
  BudgetComparisonTable,
  CategoryDoughnut,
  CategoryDrilldown,
  ContainerFlowsTable,
  InvestmentCard,
  MonthlyBarsChart,
  WaterfallChart,
  type InvestmentReport,
} from "./widgets";

const today = (): string => new Date().toISOString().slice(0, 10);

/** Last calendar day of a "YYYY-MM" key, as an ISO date. */
function monthEnd(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const day = new Date(y, m, 0).getDate(); // month m (1-based), day 0 → last of month m
  return `${key}-${String(day).padStart(2, "0")}`;
}

const dayFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
function rangeText(r: DateRange): string {
  if (r.start === null && r.end === null) return "All time";
  const f = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00`));
  return `${r.start ? f(r.start) : "…"} – ${r.end ? f(r.end) : "…"}`;
}

export function DashboardView() {
  const ready = useAtomValue(readyAtom);
  const categories = useAtomValue(categoriesAtom);
  const containers = useAtomValue(containersAtom);
  const transactions = useAtomValue(transactionsAtom);
  const budgetTargets = useAtomValue(budgetTargetsAtom);
  const snapshots = useAtomValue(snapshotsAtom);
  const [period, setPeriod] = useAtom(reportingPeriodAtom);
  const [comparePeriod, setComparePeriod] = useAtom(comparePeriodAtom);

  // `today` is stable for the session's render; core stays clock-free (§ engine).
  const now = useMemo(() => today(), []);
  const primaryRange = useMemo(() => resolvePeriod(period, now), [period, now]);
  const compareRange = useMemo(
    () => (comparePeriod ? resolvePeriod(comparePeriod, now) : null),
    [comparePeriod, now],
  );

  const shared = { categories, containers, transactions, budgetTargets, snapshots };

  if (!ready) return <p className="text-muted-foreground py-16 text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard</h1>
        <PeriodPicker
          period={period}
          onPeriodChange={setPeriod}
          comparePeriod={comparePeriod}
          onCompareChange={setComparePeriod}
        />
      </div>

      {compareRange ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ReportColumn range={primaryRange} {...shared} />
          <ReportColumn range={compareRange} {...shared} />
        </div>
      ) : (
        <ReportColumn range={primaryRange} {...shared} />
      )}
    </div>
  );
}

function ReportColumn({
  range,
  categories,
  containers,
  transactions,
  budgetTargets,
  snapshots,
}: {
  range: DateRange;
  categories: Category[];
  containers: Container[];
  transactions: Transaction[];
  budgetTargets: BudgetTarget[];
  snapshots: ContainerSnapshot[];
}) {
  const [mode, setMode] = useState<"total" | "avg">("total");
  const [drilldownId, setDrilldownId] = useState<string | null>(null);

  const expenseSlices = useMemo(
    () =>
      mode === "avg"
        ? categoryBreakdownMonthlyAverage(transactions, categories, range, {
            type: "expense",
          })
        : categoryBreakdown(transactions, categories, range, { type: "expense" }),
    [transactions, categories, range, mode],
  );
  const incomeSlices = useMemo(
    () =>
      mode === "avg"
        ? categoryBreakdownMonthlyAverage(transactions, categories, range, {
            type: "income",
          })
        : categoryBreakdown(transactions, categories, range, { type: "income" }),
    [transactions, categories, range, mode],
  );

  const monthly = useMemo(() => {
    const base = monthlyTotals(transactions, categories, range);
    return base.map((m) => ({
      ...m,
      budget: totalExpenseBudgetOnDate(budgetTargets, categories, `${m.month}-01`),
    }));
  }, [transactions, categories, budgetTargets, range]);

  const waterfall = useMemo(() => waterfallData(monthly), [monthly]);
  const flows = useMemo(
    () => containerFlows(transactions, containers, range),
    [transactions, containers, range],
  );
  const budgetRows = useMemo(
    () => budgetComparison(transactions, categories, range, budgetTargets),
    [transactions, categories, range, budgetTargets],
  );
  const drilldownSeries = useMemo(
    () =>
      drilldownId
        ? categoryMonthlySpend(transactions, drilldownId, range, budgetTargets)
        : [],
    [transactions, drilldownId, range, budgetTargets],
  );

  const investments = useMemo<InvestmentReport[]>(() => {
    const keys = monthKeysInRange(
      range,
      transactions.map((t) => t.date),
    );
    return containers
      .filter((c) => c.is_investment && !c.is_archived)
      .map((c) => {
        const nc = netContributions(transactions, c.id);
        const gl = unrealizedGainLoss(c.id, snapshots, transactions);
        return {
          containerId: c.id,
          name: c.name,
          currentValue: gl === null ? null : gl + nc,
          netContributions: nc,
          gainLoss: gl,
          series:
            gl === null
              ? []
              : keys.map((k) => ({
                  month: k,
                  value:
                    reconstructedBalance(c.id, snapshots, transactions, monthEnd(k)) ?? 0,
                })),
        };
      });
  }, [containers, snapshots, transactions, range]);

  return (
    <div className="space-y-6">
      {/* Hero — the period's net savings, the number as thesis (§12.4). */}
      <section className="bg-card rounded-2xl border p-5">
        <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
          Saved this period
        </p>
        <p
          className={cn(
            "font-display tnum mt-1 text-4xl leading-none sm:text-5xl",
            waterfall.savings < 0 && "text-destructive",
          )}
        >
          {formatCents(waterfall.savings)}
        </p>
        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="text-foreground/70 font-medium">{rangeText(range)}</span>
          <span>
            <span className="tnum text-positive font-mono">
              {formatCents(waterfall.income)}
            </span>{" "}
            in
          </span>
          <span>
            <span className="tnum text-foreground font-mono">
              {formatCents(waterfall.expenses)}
            </span>{" "}
            out
          </span>
        </div>
      </section>

      <Panel
        title="By category"
        action={
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
        }
      >
        <div className="space-y-6">
          <div>
            <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
              Expenses
            </p>
            <CategoryDoughnut
              slices={expenseSlices}
              emptyLabel="No spending in this period."
            />
          </div>
          <div>
            <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
              Income
            </p>
            <CategoryDoughnut
              slices={incomeSlices}
              emptyLabel="No income in this period."
            />
          </div>
        </div>
      </Panel>

      <Panel title="Monthly income, expenses & savings">
        <MonthlyBarsChart monthly={monthly} />
      </Panel>

      <Panel title="Income → expenses → savings">
        <WaterfallChart
          income={waterfall.income}
          expenses={waterfall.expenses}
          savings={waterfall.savings}
        />
      </Panel>

      <Panel title="Category over time">
        <CategoryDrilldown
          categories={categories}
          selectedId={drilldownId}
          onSelect={setDrilldownId}
          series={drilldownSeries}
        />
      </Panel>

      <Panel title="Container flows">
        <ContainerFlowsTable flows={flows} />
      </Panel>

      {investments.length > 0 && (
        <Panel title="Investments">
          <div className="space-y-3">
            {investments.map((r) => (
              <InvestmentCard key={r.containerId} report={r} />
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Budget comparison">
        <BudgetComparisonTable rows={budgetRows} />
      </Panel>
    </div>
  );
}
