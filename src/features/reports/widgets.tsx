"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents } from "@/core/money";
import type { Category } from "@/core/model";
import type {
  BudgetComparisonRow,
  CategorySlice,
  ContainerFlow,
  MonthlyTotal,
} from "@/core/engine";
import { cn } from "@/lib/utils";
import { categoryDotColor } from "@/features/category-color";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CHART, EmptyNote, formatAxisCents, monthLabel, MoneyTooltip } from "./chart-ui";

const axisTick = { fontSize: 11, fill: CHART.axis };

/** True if the month keys straddle more than one calendar year (→ show years). */
function spansYears(months: string[]): boolean {
  return new Set(months.map((m) => m.slice(0, 4))).size > 1;
}

// ── Category breakdown doughnut (§6.5) ──────────────────────────────────────
export function CategoryDoughnut({
  slices,
  emptyLabel,
}: {
  slices: CategorySlice[];
  emptyLabel: string;
}) {
  if (slices.length === 0) return <EmptyNote>{emptyLabel}</EmptyNote>;
  const total = slices.reduce((s, x) => s + x.amount, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative shrink-0" style={{ width: 168, height: 168 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="amount"
              nameKey="name"
              innerRadius={54}
              outerRadius={82}
              paddingAngle={slices.length > 1 ? 2 : 0}
              strokeWidth={0}
            >
              {slices.map((s) => (
                <Cell key={s.categoryId} fill={categoryDotColor(s.categoryId)} />
              ))}
            </Pie>
            <Tooltip content={<MoneyTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum font-mono text-sm font-medium">{formatCents(total)}</span>
          <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
            total
          </span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 self-stretch">
        {slices.map((s) => (
          <li key={s.categoryId} className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: categoryDotColor(s.categoryId) }}
            />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="text-muted-foreground tnum shrink-0 text-xs">
              {Math.round((s.amount / total) * 100)}%
            </span>
            <span className="tnum shrink-0 font-mono text-sm">
              {formatCents(s.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Monthly income / expense / savings bars + budget overlay (§6.5) ──────────
export function MonthlyBarsChart({ monthly }: { monthly: MonthlyTotal[] }) {
  if (monthly.length === 0) return <EmptyNote>No months in this period.</EmptyNote>;
  const withYear = spansYears(monthly.map((m) => m.month));
  const data = monthly.map((m) => ({ ...m, label: monthLabel(m.month, withYear) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis
          tickFormatter={formatAxisCents}
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <ReferenceLine y={0} stroke={CHART.grid} />
        <Tooltip
          content={<MoneyTooltip />}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Income" fill={CHART.income} radius={[3, 3, 0, 0]} />
        <Bar
          dataKey="expense"
          name="Expenses"
          fill={CHART.expense}
          radius={[3, 3, 0, 0]}
        />
        <Bar
          dataKey="savings"
          name="Savings"
          fill={CHART.savings}
          radius={[3, 3, 0, 0]}
        />
        <Line
          dataKey="budget"
          name="Budget"
          type="monotone"
          stroke={CHART.axis}
          strokeDasharray="5 4"
          strokeWidth={1.5}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Income → Expenses → Savings waterfall (§6.5, stacked-bar + transparent base) ──
export function WaterfallChart({
  income,
  expenses,
  savings,
}: {
  income: number;
  expenses: number;
  savings: number;
}) {
  if (income === 0 && expenses === 0)
    return <EmptyNote>No activity in this period.</EmptyNote>;
  // Each bar floats on a transparent base so the three read as a running total:
  // income rises from 0; expenses drop from income down to savings; savings from 0.
  const data = [
    { name: "Income", base: 0, bar: income, tipColor: CHART.income },
    {
      name: "Expenses",
      base: Math.min(savings, income),
      bar: expenses,
      tipColor: CHART.expense,
    },
    {
      name: "Savings",
      base: 0,
      bar: savings,
      tipColor: savings < 0 ? CHART.negative : CHART.savings,
    },
  ];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis
          tickFormatter={formatAxisCents}
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <ReferenceLine y={0} stroke={CHART.grid} />
        <Tooltip
          content={<MoneyTooltip />}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
        />
        <Bar dataKey="base" stackId="w" fill="transparent" />
        <Bar dataKey="bar" stackId="w" radius={[3, 3, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.tipColor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Single-category drill-down vs. its time-variant budget (§6.5) ────────────
export function CategoryDrilldown({
  categories,
  selectedId,
  onSelect,
  series,
}: {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  series: { month: string; spend: number; budget: number | null }[];
}) {
  const expenseCats = categories
    .filter((c) => c.type === "expense")
    .sort((a, b) => a.name.localeCompare(b.name));
  const withYear = spansYears(series.map((m) => m.month));
  const data = series.map((m) => ({ ...m, label: monthLabel(m.month, withYear) }));

  return (
    <div className="space-y-4">
      <Select value={selectedId ?? undefined} onValueChange={onSelect}>
        <SelectTrigger size="sm" className="rounded-full">
          <SelectValue placeholder="Pick a category" />
        </SelectTrigger>
        <SelectContent>
          {expenseCats.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <span
                className="size-2.5 rounded-full"
                style={{ background: categoryDotColor(c.id) }}
              />
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedId == null ? (
        <EmptyNote>
          Pick a category to see its month-by-month spend against budget.
        </EmptyNote>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis
              tickFormatter={formatAxisCents}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              content={<MoneyTooltip />}
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="spend"
              name="Spent"
              fill={selectedId ? categoryDotColor(selectedId) : CHART.expense}
              radius={[3, 3, 0, 0]}
            />
            <Line
              dataKey="budget"
              name="Budget"
              type="monotone"
              stroke={CHART.axis}
              strokeDasharray="5 4"
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Container Flows table (§5.4) ─────────────────────────────────────────────
export function ContainerFlowsTable({ flows }: { flows: ContainerFlow[] }) {
  const active = flows.filter((f) => f.inflow !== 0 || f.outflow !== 0);
  if (active.length === 0) return <EmptyNote>No transfers in this period.</EmptyNote>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Container</TableHead>
          <TableHead className="text-right">In</TableHead>
          <TableHead className="text-right">Out</TableHead>
          <TableHead className="text-right">Net</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {active.map((f) => (
          <TableRow key={f.containerId}>
            <TableCell className="font-medium">{f.name}</TableCell>
            <TableCell className="tnum text-positive text-right font-mono">
              {f.inflow ? formatCents(f.inflow) : "—"}
            </TableCell>
            <TableCell className="tnum text-muted-foreground text-right font-mono">
              {f.outflow ? formatCents(f.outflow) : "—"}
            </TableCell>
            <TableCell
              className={cn(
                "tnum text-right font-mono font-medium",
                f.net < 0 && "text-destructive",
              )}
            >
              {formatCents(f.net)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Budget comparison table, re-scoped to the active period (§6.3) ───────────
export function BudgetComparisonTable({ rows }: { rows: BudgetComparisonRow[] }) {
  if (rows.length === 0)
    return <EmptyNote>No budgets or spending in this period.</EmptyNote>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Avg / mo</TableHead>
          <TableHead className="text-right">Budget</TableHead>
          <TableHead className="text-right">Δ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const over = r.deltaPct !== null && r.deltaPct > 0;
          return (
            <TableRow key={r.categoryId}>
              <TableCell className="flex items-center gap-2 font-medium">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: categoryDotColor(r.categoryId) }}
                />
                {r.name}
              </TableCell>
              <TableCell className="tnum text-right font-mono">
                {formatCents(r.actualMonthlyAvg)}
              </TableCell>
              <TableCell className="tnum text-muted-foreground text-right font-mono">
                {r.budget === null ? "—" : formatCents(r.budget)}
              </TableCell>
              <TableCell
                className={cn(
                  "tnum text-right font-mono",
                  r.deltaPct === null
                    ? "text-muted-foreground"
                    : over
                      ? "text-destructive"
                      : "text-positive",
                )}
              >
                {r.deltaPct === null
                  ? "—"
                  : `${over ? "+" : ""}${r.deltaPct.toFixed(0)}%`}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ── Investment gain/loss card + reconstructed-balance sparkline (§5.6) ────────
export interface InvestmentReport {
  containerId: string;
  name: string;
  currentValue: number | null;
  netContributions: number;
  gainLoss: number | null;
  series: { month: string; value: number }[];
}

export function InvestmentCard({ report }: { report: InvestmentReport }) {
  const { currentValue, netContributions, gainLoss, series } = report;
  const withYear = spansYears(series.map((m) => m.month));
  const data = series.map((m) => ({ ...m, label: monthLabel(m.month, withYear) }));
  const gainColor =
    gainLoss === null ? "" : gainLoss >= 0 ? "text-positive" : "text-destructive";

  return (
    <div className="bg-background/40 rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{report.name}</span>
        {currentValue === null ? (
          <span className="text-muted-foreground text-xs">No reported value yet</span>
        ) : (
          <span className="tnum font-mono text-sm">{formatCents(currentValue)}</span>
        )}
      </div>
      <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
        <span>
          contributed{" "}
          <span className="tnum text-foreground/80 font-mono">
            {formatCents(netContributions)}
          </span>
        </span>
        {gainLoss !== null && (
          <span>
            gain/loss{" "}
            <span className={cn("tnum font-mono font-medium", gainColor)}>
              {gainLoss >= 0 ? "+" : ""}
              {formatCents(gainLoss)}
            </span>
          </span>
        )}
      </div>
      {data.length > 1 && (
        <ResponsiveContainer width="100%" height={72} className="mt-3">
          <LineChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
            <Tooltip content={<MoneyTooltip />} />
            <Line
              dataKey="value"
              name="Value"
              type="monotone"
              stroke={CHART.savings}
              strokeWidth={1.75}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
