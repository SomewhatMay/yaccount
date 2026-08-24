"use client";

import Link from "next/link";
import type { IncomeResilience, IncomeResilienceSource } from "@/core/engine";
import { formatCents } from "@/core/money";
import { Eyebrow, LeaderRow, Marginalia, Money } from "@/features/ui";
import { cn } from "@/lib/utils";
import type { WidgetContext } from "../registry";

const monthName = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

function pct(share: number | null): string {
  return share === null ? "—" : Math.round(share * 100) + "%";
}

function resilience(context: WidgetContext): IncomeResilience {
  return context.aggregates.incomeResilience(context.range, context.today);
}

function RangeBand({
  result,
  compact = false,
}: {
  result: IncomeResilience;
  compact?: boolean;
}) {
  const low = result.observedMin!;
  const high = result.observedMax!;
  const typical = result.typicalMonthly!;
  const x = high === low ? 360 : 32 + ((typical - low) / (high - low)) * 656;
  return (
    <div className={compact ? "mt-3" : "mt-5"}>
      <svg
        viewBox="0 0 720 64"
        role="img"
        aria-label={
          "Observed income range: " +
          formatCents(low) +
          " to " +
          formatCents(high) +
          "; typical " +
          formatCents(typical)
        }
        className={cn("w-full overflow-visible", compact ? "h-10" : "h-16")}
        preserveAspectRatio="none"
      >
        <line
          x1="32"
          x2="688"
          y1="28"
          y2="28"
          className="stroke-muted-foreground/40"
          strokeWidth="12"
          strokeLinecap="square"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={x}
          x2={x}
          y1="12"
          y2="44"
          className="stroke-primary"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="text-muted-foreground -mt-1 flex justify-between gap-3 font-mono text-[0.6875rem]">
        <span>{formatCents(low)}</span>
        {!compact && <span>typical · {formatCents(typical)}</span>}
        <span>{formatCents(high)}</span>
      </div>
    </div>
  );
}

function SourceRow({ source }: { source: IncomeResilienceSource }) {
  const share = source.share === null ? 0 : Math.max(0, Math.min(1, source.share));
  return (
    <Link
      href="/ledger"
      className="hover:bg-muted/45 focus-visible:ring-ring/50 -mx-1 block rounded-lg px-1 py-1 focus-visible:ring-3 focus-visible:outline-none"
    >
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{source.label}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="tnum font-mono">{pct(source.share)}</span>
          <span className="text-muted-foreground w-16 text-right text-xs">
            {source.classification}
          </span>
        </span>
      </div>
      <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: share * 100 + "%" }}
        />
      </div>
    </Link>
  );
}

function SummaryRow({
  label,
  children,
  ariaLabel,
}: {
  label: string;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <div aria-label={ariaLabel}>
      <LeaderRow label={label}>{children}</LeaderRow>
    </div>
  );
}

function Progress({ result }: { result: IncomeResilience }) {
  return (
    <div>
      <Eyebrow>More history needed</Eyebrow>
      <p className="mt-2 text-sm">
        {result.months.length} of 6 complete income months observed.
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        The current partial month never enters the classification.
      </p>
    </div>
  );
}

export function IncomeResilienceExpanded(context: WidgetContext) {
  const result = resilience(context);
  if (!result.eligible) return <Progress result={result} />;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Typical month</Eyebrow>
          <p aria-label={"Typical month: " + formatCents(result.typicalMonthly!)}>
            <Money cents={result.typicalMonthly!} className="figure-lg mt-1" />
          </p>
        </div>
        <span className="text-muted-foreground text-xs">
          last {result.months.length} complete months
        </span>
      </div>
      <RangeBand result={result} />
      <section className="mt-5" aria-labelledby="income-resilience-sources">
        <Eyebrow id="income-resilience-sources" as="h3">
          Sources
        </Eyebrow>
        <div className="mt-2 grid gap-2">
          {result.sources.map((source) => (
            <SourceRow key={source.key} source={source} />
          ))}
        </div>
      </section>
      <div className="mt-5">
        <SummaryRow
          label="Scheduled fixed income"
          ariaLabel={
            "Scheduled fixed income: " +
            formatCents(result.scheduledFixedMonthly) +
            " per month"
          }
        >
          <span className="tnum font-mono text-xs">
            {formatCents(result.scheduledFixedMonthly)}/mo
          </span>
        </SummaryRow>
        <SummaryRow
          label="Largest-source share"
          ariaLabel={"Largest-source share: " + pct(result.largestSourceShare)}
        >
          <span className="tnum font-mono text-xs">{pct(result.largestSourceShare)}</span>
        </SummaryRow>
        <SummaryRow
          label="Month-to-month range"
          ariaLabel={"Month-to-month range: " + formatCents(result.monthToMonthRange!)}
        >
          <Money cents={result.monthToMonthRange!} tone="quiet" />
        </SummaryRow>
      </div>
      <Marginalia className="mt-3 text-xs">
        “Steady” means a source appeared within 5% in all {result.months.length} months.
        Scheduled income is descriptive, never guaranteed.
      </Marginalia>
    </div>
  );
}

export function IncomeResilienceCompact(context: WidgetContext) {
  const result = resilience(context);
  if (!result.eligible) return <Progress result={result} />;
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>Typical month</Eyebrow>
          <p aria-label={"Typical month: " + formatCents(result.typicalMonthly!)}>
            <Money cents={result.typicalMonthly!} className="figure-md mt-1" />
          </p>
        </div>
        <span className="text-muted-foreground text-xs">
          {result.months.length} months
        </span>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Range ·{" "}
        <span className="tnum font-mono">
          {formatCents(result.observedMin!)} – {formatCents(result.observedMax!)}
        </span>
      </p>
      <RangeBand result={result} compact />
      <div className="mt-3">
        <LeaderRow label="Largest source">
          <span className="tnum font-mono text-xs">{pct(result.largestSourceShare)}</span>
        </LeaderRow>
        <LeaderRow label="Fixed scheduled">
          <span className="tnum font-mono text-xs">
            {formatCents(result.scheduledFixedMonthly)}/mo
          </span>
        </LeaderRow>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">No score; inspect sources.</p>
    </div>
  );
}
