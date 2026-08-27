"use client";

import Link from "next/link";
import { cravingWinCumulativeSeries, cravingWinSummary } from "@/core/engine";
import { formatCents } from "@/core/money";
import { Eyebrow, Marginalia, Sparkline } from "@/features/ui";
import type { WidgetContext } from "../registry";

function ariaSummary(context: WidgetContext): string {
  const summary = cravingWinSummary(
    context.cravingWins,
    context.ledgerTransactions,
    context.today,
  );
  return `${formatCents(summary.totalKept)} kept across ${summary.winCount} ${summary.winCount === 1 ? "win" : "wins"}`;
}

function OpenCravingsLink() {
  return (
    <Link
      href="/cravings"
      className="text-primary text-xs font-medium underline underline-offset-2"
    >
      Open history
    </Link>
  );
}

export function CravingsSavingsExpanded(context: WidgetContext) {
  const summary = cravingWinSummary(
    context.cravingWins,
    context.ledgerTransactions,
    context.today,
  );
  const series = cravingWinCumulativeSeries(context.cravingWins);
  return (
    <div role="group" aria-label={ariaSummary(context)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>All time</Eyebrow>
          <p className="figure-sub mt-1.5">{formatCents(summary.totalKept)}</p>
        </div>
        <OpenCravingsLink />
      </div>
      {series.length > 1 && (
        <Sparkline
          values={series}
          area
          height={36}
          strokeWidth={1.25}
          className="text-brand/60 mt-3"
        />
      )}
      <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span className="tnum font-mono">
          {formatCents(summary.thisMonthKept)} this month
        </span>
        <span className="tnum font-mono">
          {formatCents(summary.movedToGoals)} moved to goals
        </span>
      </div>
      <Marginalia className="mt-3 text-xs">
        {ariaSummary(context)}. Only linked goal transfers change balances.
      </Marginalia>
    </div>
  );
}

export function CravingsSavingsCompact(context: WidgetContext) {
  const summary = cravingWinSummary(
    context.cravingWins,
    context.ledgerTransactions,
    context.today,
  );
  return (
    <div role="group" aria-label={ariaSummary(context)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>All time</Eyebrow>
          <p className="figure-sub mt-1">{formatCents(summary.totalKept)}</p>
        </div>
        <OpenCravingsLink />
      </div>
      <p className="text-muted-foreground tnum mt-2 font-mono text-xs">
        {formatCents(summary.thisMonthKept)} this month
      </p>
      <Marginalia className="mt-2 text-xs">{ariaSummary(context)}.</Marginalia>
    </div>
  );
}
