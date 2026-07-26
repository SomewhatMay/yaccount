"use client";

import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import { formatCents } from "@/core/money";
import type { BudgetPace, DailySpend, PayeeTotal, SankeyFlows } from "@/core/engine";
import type { Transaction } from "@/core/model";
import { cn } from "@/lib/utils";
import { categoryDotColor } from "@/features/category-color";
import { Marginalia, Money, Sparkline } from "@/features/ui";
import { Progress } from "@/components/ui/progress";
import { CHART, EmptyNote, MoneyTooltip } from "./chart-ui";

/**
 * The M11 dashboard's own widgets. Presentational: each takes the numbers a
 * `src/core/engine` derivation already computed and draws them. Nothing here
 * reads a store or a clock — `registry.tsx` does that and hands it over.
 */

// ── Δ against the previous window ────────────────────────────────────────────

/**
 * A change, with its direction as a glyph and NOT as a colour.
 *
 * §12.2 reserves emerald for money genuinely coming in and rose for a true
 * negative. Painting "expenses fell 9%" emerald would spend the one meaningful
 * accent on a mood, and once every delta is coloured the colours stop meaning
 * anything. The arrow carries the direction; the label beside it carries whether
 * that is good news.
 */
export function Delta({
  value,
  unit = "pct",
  className,
}: {
  value: number | null;
  /** Percent for a quantity; POINTS for a rate — a rate that goes 25% → 40% has
   *  not risen 60%, and saying so is the classic way to mis-state a ratio. */
  unit?: "pct" | "pts";
  className?: string;
}) {
  if (value === null) return null;
  const rounded = Math.round(value);
  if (rounded === 0) {
    return (
      <span className={cn("text-muted-foreground text-xs", className)}>no change</span>
    );
  }
  const Arrow = rounded > 0 ? ArrowUpIcon : ArrowDownIcon;
  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex items-center gap-0.5 text-xs",
        className,
      )}
    >
      <Arrow className="size-3 shrink-0" aria-hidden />
      <span className="tnum font-mono">
        {Math.abs(rounded)}
        {unit === "pct" ? "%" : " pts"}
      </span>
    </span>
  );
}

// ── The KPI strip ────────────────────────────────────────────────────────────

export interface Kpi {
  id: string;
  label: string;
  /** Already formatted — money in mono, a rate as a percentage. */
  value: React.ReactNode;
  delta: number | null;
  unit?: "pct" | "pts";
  /** A shape behind the tile, where the figure genuinely has a series. */
  spark?: number[];
}

/**
 * Four figures side by side (§6.5 M11). Below `sm` the strip scrolls sideways
 * rather than stacking into four full-width cards that push everything else off
 * the screen — the same rule the filter rail follows.
 */
export function KpiStrip({ kpis, note }: { kpis: Kpi[]; note?: string }) {
  return (
    <section>
      {/* Full-bleed to the screen edge on a phone, re-inset by `px-5` so the
          first card lines up with the panels below. The inner `w-max` track is
          the fix that makes BOTH ends of that padding render: with the cards as
          direct children of the scroll container, a browser drops the padding on
          one edge (here the left), so the strip sat flush against the screen. */}
      <div className="-mx-5 [scrollbar-width:none] overflow-x-auto px-5 sm:mx-0 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max snap-x gap-2 sm:grid sm:w-auto sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.id}
              className="bg-card min-w-36 shrink-0 snap-start rounded-2xl border p-3.5 sm:min-w-0"
            >
              <p className="eyebrow text-muted-foreground truncate">{kpi.label}</p>
              <p className="mt-1.5 text-lg leading-none">{kpi.value}</p>
              <div className="mt-2 flex h-4 items-center justify-between gap-2">
                <Delta value={kpi.delta} unit={kpi.unit} />
                {kpi.spark && kpi.spark.length > 1 && (
                  <Sparkline
                    values={kpi.spark}
                    height={14}
                    strokeWidth={1.25}
                    className="text-brand/50 w-10 shrink-0"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {note && <p className="text-muted-foreground mt-2 text-xs">{note}</p>}
    </section>
  );
}

// ── Budget pace ──────────────────────────────────────────────────────────────

/** What the two bars mean together — the insight the bars alone don't state. */
export function paceNote(pace: BudgetPace, monthLabel: string): string {
  if (pace.budget === 0) return `no allowances set for ${monthLabel}`;
  if (pace.remaining < 0) return `${formatCents(-pace.remaining)} over the allowance`;
  if (pace.onPace) return `on pace · ${formatCents(pace.remaining)} left`;
  return `ahead of pace · heading for ${formatCents(pace.projected)}`;
}

function PaceBar({
  label,
  pct,
  tone,
}: {
  label: string;
  pct: number;
  tone: "spent" | "over" | "clock";
}) {
  const shown = Math.round(pct * 100);
  return (
    <>
      <span className="text-muted-foreground text-xs">{label}</span>
      <Progress
        value={Math.min(100, Math.max(0, pct * 100))}
        aria-label={`${label} ${shown}%`}
        className={cn(
          "h-2",
          tone === "over" && "[&>[data-slot=progress-indicator]]:bg-destructive",
          tone === "clock" && "[&>[data-slot=progress-indicator]]:bg-muted-foreground/50",
        )}
      />
      <span className="tnum text-muted-foreground w-10 text-right font-mono text-xs">
        {shown}%
      </span>
    </>
  );
}

/**
 * Spending against the month's own clock (M11) — the question a "71% spent" bar
 * leaves unanswered is whether 71% is early or late, so the month is drawn as its
 * own bar directly beneath.
 */
export function BudgetPaceMeter({
  pace,
  monthLabel,
}: {
  pace: BudgetPace;
  monthLabel: string;
}) {
  return (
    <div>
      <div className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-x-3 gap-y-2.5">
        <PaceBar
          label="spent"
          pct={pace.spentPct ?? 0}
          tone={pace.remaining < 0 ? "over" : "spent"}
        />
        <PaceBar label="month" pct={pace.monthElapsedPct} tone="clock" />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Marginalia className="text-sm">{paceNote(pace, monthLabel)}</Marginalia>
        <span className="text-muted-foreground text-xs">
          <Money cents={pace.spent} className="text-foreground/80" />
          {pace.budget > 0 && <> of {formatCents(pace.budget)}</>}
        </span>
      </div>
    </div>
  );
}

// ── Money flow (Sankey) ──────────────────────────────────────────────────────

type FlowKind = SankeyFlows["nodes"][number]["kind"];

function flowColor(
  kind: FlowKind,
  id: string | null,
  colorOf: (id: string) => string = categoryDotColor,
): string {
  if (kind === "income") return CHART.income;
  if (kind === "drawdown") return CHART.negative;
  if (kind === "hub" || kind === "saved") return CHART.savings;
  return id ? colorOf(id) : CHART.expense;
}

interface FlowNodePayload {
  name?: string;
  kind?: FlowKind;
  id?: string | null;
  depth?: number;
}

/**
 * One node of the flow: a thin bar, and its name beside it when the bar is tall
 * enough to hold a line of text. A label on a 4px strand would collide with its
 * neighbour, so those nodes stay unlabelled and the tooltip names them instead —
 * a clipped label is worse than none (dataviz: measure before you place).
 */
function FlowNode(props: { colorOf?: (id: string) => string }) {
  const { x, y, width, height, payload, depth, colorOf } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: FlowNodePayload;
    depth?: number;
    // recharts preserves author-set props while injecting its own layout props.
    colorOf?: (id: string) => string;
  };
  const kind = payload.kind ?? "expense";
  const fill = flowColor(kind, payload.id ?? null, colorOf);
  const at = depth ?? payload.depth ?? 0;
  const label = kind === "hub" ? null : (payload.name ?? "");
  const right = at > 0;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={2} />
      {label && height >= 11 && (
        <text
          x={right ? x - 5 : x + width + 5}
          y={y + height / 2}
          textAnchor={right ? "end" : "start"}
          dominantBaseline="middle"
          fontSize={10}
          fill="var(--muted-foreground)"
        >
          {label.length > 14 ? `${label.slice(0, 13)}…` : label}
        </text>
      )}
    </g>
  );
}

export function MoneyFlowChart({
  flows,
  colorOf,
}: {
  flows: SankeyFlows;
  colorOf?: (categoryId: string) => string;
}) {
  if (flows.links.length === 0)
    return <EmptyNote>Nothing flowed in or out in this period.</EmptyNote>;

  // recharts mutates the object it is handed while it lays the diagram out, so
  // it gets a copy — a memoised derivation must not be edited underneath React.
  const data = {
    nodes: flows.nodes.map((n) => ({ ...n })),
    links: flows.links.map((l) => ({ ...l })),
  };
  return (
    <ResponsiveContainer
      width="100%"
      height={Math.min(360, 40 + flows.nodes.length * 26)}
    >
      <Sankey
        data={data}
        nodePadding={16}
        nodeWidth={9}
        margin={{ top: 6, right: 4, bottom: 6, left: 4 }}
        node={<FlowNode colorOf={colorOf} />}
        link={{ stroke: CHART.axis, strokeOpacity: 0.16 }}
      >
        <Tooltip content={<MoneyTooltip />} />
      </Sankey>
    </ResponsiveContainer>
  );
}

// ── Spending calendar ────────────────────────────────────────────────────────

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const HEAT_STEPS = [0.16, 0.36, 0.6, 0.9];

/** Monday-first weekday index of an ISO day (0 = Monday). */
function weekdayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}

/**
 * Which of four heat steps a day's spend falls in. The thresholds are quartiles
 * of the window's own non-zero days, so the scale describes THIS reader's
 * spending rather than a fixed dollar ramp that would leave one person's calendar
 * uniformly pale and another's uniformly dark.
 */
function heatScale(values: number[]): (amount: number) => number {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return () => 0;
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const cuts = [at(0.25), at(0.5), at(0.75)];
  return (amount) => {
    if (amount <= 0) return 0;
    return 1 + cuts.filter((c) => amount > c).length;
  };
}

function heatStyle(level: number): React.CSSProperties | undefined {
  if (level === 0) return undefined;
  const pct = Math.round(HEAT_STEPS[level - 1] * 100);
  return { backgroundColor: `color-mix(in oklab, var(--brand) ${pct}%, transparent)` };
}

const cellDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const monthName = new Intl.DateTimeFormat("en-US", { month: "short" });

/**
 * A day-by-day heat grid (§6.5 M11): weekdays across, weeks down. Sequential —
 * one hue getting stronger, never a rainbow — so darker always means more.
 */
export function SpendingCalendar({
  days,
  spend,
  hrefFor,
}: {
  /** The day axis, ascending (`trailingDays`). */
  days: string[];
  /** Sparse per-day outflow (`dailySpend`), keyed by ISO day. */
  spend: Map<string, number>;
  /** A day with activity links to the register for exactly that day. A blank day
   *  is not a link — there is nothing to land on, and a grid of 56 tiny targets
   *  where most go nowhere is the "too small to tap" trap. */
  hrefFor?: (day: string) => string;
}) {
  if (days.length === 0) return <EmptyNote>No days to show.</EmptyNote>;
  const level = heatScale(days.map((d) => spend.get(d) ?? 0));
  const pad = weekdayIndex(days[0]);
  const months = [...new Set(days.map((d) => d.slice(0, 7)))].map((m) =>
    monthName.format(new Date(`${m}-01T00:00:00`)),
  );

  return (
    <div>
      <div className="mx-auto max-w-sm">
        <div className="text-muted-foreground mb-1 grid grid-cols-7 gap-1 text-center text-[10px]">
          {WEEKDAYS.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: pad }, (_, i) => (
            <div key={`pad-${i}`} className="h-7" aria-hidden />
          ))}
          {days.map((day) => {
            const amount = spend.get(day) ?? 0;
            const lv = level(amount);
            const label = `${cellDate.format(new Date(`${day}T00:00:00`))} · ${
              amount > 0
                ? formatCents(amount)
                : amount < 0
                  ? // A refunded day is not a quiet day, and the grid draws both
                    // the same — so the label has to tell them apart.
                    `${formatCents(-amount)} came back`
                  : "nothing spent"
            }`;
            // Only a day that has something links anywhere.
            const href = amount !== 0 ? hrefFor?.(day) : undefined;
            const cls = cn(
              "h-7 rounded-md",
              lv === 0 && "bg-surface-sunken",
              href &&
                "hover:ring-primary/50 focus-visible:ring-ring cursor-pointer transition-shadow hover:ring-2 focus-visible:ring-2 focus-visible:outline-none",
            );
            return href ? (
              <Link
                key={day}
                href={href}
                aria-label={label}
                title={label}
                style={heatStyle(lv)}
                className={cls}
              />
            ) : (
              <div key={day} title={label} style={heatStyle(lv)} className={cls} />
            );
          })}
        </div>
      </div>
      <div className="text-muted-foreground mt-3 flex items-center justify-between gap-3 text-[11px]">
        <span>{months.join(" · ")}</span>
        <span className="flex items-center gap-1">
          less
          <span className="bg-surface-sunken size-2.5 rounded-sm" />
          {HEAT_STEPS.map((_, i) => (
            <span key={i} className="size-2.5 rounded-sm" style={heatStyle(i + 1)} />
          ))}
          more
        </span>
      </div>
    </div>
  );
}

// ── The three lists ──────────────────────────────────────────────────────────

/**
 * A row that is a door into the ledger when the widget gives it one (M11).
 *
 * The whole row is the target — a name in a summary list is small, and a link
 * that only covers the text is a link you keep missing. `hover:bg-muted` is the
 * one affordance that says "this goes somewhere"; §12 spends nothing louder on it.
 */
function LinkRow({
  href,
  className,
  children,
}: {
  href?: string;
  className: string;
  children: React.ReactNode;
}) {
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link
      href={href}
      className={cn(
        className,
        "hover:bg-muted/60 focus-visible:ring-ring -mx-2 rounded-lg px-2 transition-colors focus-visible:ring-2 focus-visible:outline-none",
      )}
    >
      {children}
    </Link>
  );
}

/** A name, a rail of dots, an amount — §12.4's leaders, earning their keep on a
 *  short summary list rather than in the dense register. Each payee links to the
 *  register searched for it, over the widget's window. */
export function PayeeList({
  payees,
  hrefFor,
}: {
  payees: PayeeTotal[];
  hrefFor?: (payee: string) => string;
}) {
  if (payees.length === 0) return <EmptyNote>No spending in this period.</EmptyNote>;
  return (
    <div>
      {payees.map((p) => (
        <LinkRow
          key={p.payee}
          href={hrefFor?.(p.payee)}
          className="leaders py-1.5 text-sm"
        >
          <span className="inline-flex min-w-0 items-baseline gap-2">
            <span className="truncate">{p.payee}</span>
            {p.count > 1 && (
              <span className="text-muted-foreground tnum shrink-0 font-mono text-xs">
                ×{p.count}
              </span>
            )}
          </span>
          <Money cents={p.amount} className="text-sm" />
        </LinkRow>
      ))}
    </div>
  );
}

const rowDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function formatDay(iso: string): string {
  return rowDate.format(new Date(`${iso}T00:00:00`));
}

/** The biggest entries of the window — a register row's shape, without its
 *  actions: this is a report, and acting on a row belongs on the ledger. */
export function LargestList({
  rows,
  nameOf,
  hrefFor,
  colorOf = categoryDotColor,
}: {
  rows: Transaction[];
  nameOf: (categoryId: string | null) => string;
  /** Each entry links to itself in the register, scrolled to and flashed. */
  hrefFor?: (t: Transaction) => string;
  colorOf?: (categoryId: string) => string;
}) {
  if (rows.length === 0) return <EmptyNote>Nothing logged in this period.</EmptyNote>;
  return (
    <ul className="divide-y">
      {rows.map((t) => (
        <li key={t.id}>
          <LinkRow href={hrefFor?.(t)} className="flex items-center gap-3 py-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: colorOf(t.category_id ?? "") }}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{t.vendor_source}</span>
              <span className="text-muted-foreground block truncate text-xs">
                {nameOf(t.category_id)} · {formatDay(t.date)}
              </span>
            </span>
            <Money
              cents={t.amount}
              tone={t.amount >= 0 ? "in" : "neutral"}
              className="shrink-0 text-sm"
            />
          </LinkRow>
        </li>
      ))}
    </ul>
  );
}

/** Latest register activity, kept deliberately compact for the dashboard glance. */
export function RecentEntriesList({
  rows,
  detailOf,
  hrefFor,
  colorOf = categoryDotColor,
}: {
  rows: Transaction[];
  detailOf: (t: Transaction) => string;
  hrefFor?: (t: Transaction) => string;
  colorOf?: (categoryId: string) => string;
}) {
  if (rows.length === 0) return <EmptyNote>Nothing logged yet.</EmptyNote>;
  return (
    <ul className="divide-y">
      {rows.map((t) => (
        <li key={t.id}>
          <LinkRow href={hrefFor?.(t)} className="flex items-center gap-3 py-2.5">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: colorOf(t.category_id ?? "") }}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {t.vendor_source}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {detailOf(t)} · {formatDay(t.date)}
              </span>
            </span>
            <Money
              cents={t.amount}
              absolute={t.to_container_id !== null}
              tone={
                t.to_container_id !== null ? "quiet" : t.amount >= 0 ? "in" : "neutral"
              }
              className="shrink-0 text-sm"
            />
          </LinkRow>
        </li>
      ))}
    </ul>
  );
}

export interface UpcomingRow {
  key: string;
  date: string;
  name: string;
  amount: number | null;
}

/** What is scheduled next (§5.8). Nothing here has been generated — this reads
 *  the rules' grid, so opening the dashboard can never fill the Inbox. */
export function UpcomingList({ rows }: { rows: UpcomingRow[] }) {
  if (rows.length === 0)
    return <EmptyNote>Nothing scheduled in the next 30 days.</EmptyNote>;
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-3 py-2">
          <span className="tnum text-muted-foreground w-14 shrink-0 font-mono text-xs">
            {formatDay(r.date)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
          {r.amount === null ? (
            <span className="text-muted-foreground shrink-0 text-xs">set later</span>
          ) : (
            <Money cents={r.amount} className="shrink-0 text-sm" />
          )}
        </li>
      ))}
    </ul>
  );
}

export interface GoalRow {
  id: string;
  name: string;
  basis: number;
  target: number | null;
  progress: number | null;
  monthly: number;
}

/** Active goals at a glance (§5.9) — progress, and what each asks this month. */
export function GoalsRail({ goals }: { goals: GoalRow[] }) {
  if (goals.length === 0)
    return <EmptyNote>No active goals. Start one to see it here.</EmptyNote>;
  return (
    <ul className="space-y-3.5">
      {goals.map((g) => (
        <li key={g.id}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-sm">{g.name}</span>
            <span className="text-muted-foreground shrink-0 text-xs">
              <Money cents={g.basis} className="text-foreground/80" />
              {g.target !== null && <> of {formatCents(g.target)}</>}
            </span>
          </div>
          {g.progress !== null && (
            <Progress
              value={Math.min(100, Math.max(0, g.progress * 100))}
              aria-label={`${g.name} ${Math.round(g.progress * 100)}%`}
              className="mt-1.5 h-1.5"
            />
          )}
          {g.monthly > 0 && (
            <p className="text-muted-foreground mt-1 text-xs">
              {formatCents(g.monthly)} a month to stay on pace
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The heat grid's day axis wants a lookup, not a list. */
export function spendByDay(rows: DailySpend[]): Map<string, number> {
  return new Map(rows.map((r) => [r.date, r.amount]));
}
