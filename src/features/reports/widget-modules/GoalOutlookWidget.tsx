"use client";

import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import type { GoalOutlook, GoalOutlookRow } from "@/core/engine";
import { formatCents } from "@/core/money";
import { focusHref } from "@/features/focus-link";
import { Eyebrow, LeaderRow, Marginalia, Money } from "@/features/ui";
import { cn } from "@/lib/utils";
import type { WidgetContext } from "../registry";

const monthYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

function dateLabel(date: string): string {
  return monthYear.format(new Date(`${date}T00:00:00`));
}

function summary(outlook: GoalOutlook): string {
  const change = outlook.counts.needsChange;
  return `${outlook.counts.onTrack} on track; ${change} ${change === 1 ? "needs" : "need"} a change; ${outlook.counts.passive} passive`;
}

function ariaSummary(outlook: GoalOutlook): string {
  return `${summary(outlook)}; ${formatCents(outlook.totalMonthly)} planned this month`;
}

function planCopy(row: GoalOutlookRow): string {
  if (row.requiresReplan) {
    const left = Math.max(0, (row.target ?? row.basis) - row.basis);
    return `Past deadline with ${formatCents(left)} left. Adjust the date or target.`;
  }
  if (row.mode === "passive") {
    return "Tracking progress without a monthly ask.";
  }
  if (row.mode === "deadline") {
    return row.monthlyAsk === 0
      ? "Target funded."
      : `${formatCents(row.monthlyAsk)}/month reaches the target by ${dateLabel(row.deadline!)}.`;
  }
  if (row.projectedCompletion) {
    return `${formatCents(row.monthlyAsk)}/month points to ${dateLabel(row.projectedCompletion)}.`;
  }
  return `${formatCents(row.monthlyAsk)}/month planned; no fixed finish line.`;
}

function basisLabel(row: GoalOutlookRow): string {
  return row.kind === "reserve" ? "Reserve basis" : "Contributed";
}

function GoalRow({ row }: { row: GoalOutlookRow }) {
  const percent = Math.round((row.progress ?? 0) * 100);
  const target = row.target;
  return (
    <div className="py-3">
      <Link
        href={focusHref("/goals", row.goalId)}
        className="hover:bg-muted/45 focus-visible:ring-ring/50 -mx-1 block rounded-lg px-1 focus-visible:ring-3 focus-visible:outline-none"
      >
        <LeaderRow label={row.name} className="py-0 font-medium">
          <span
            className={cn(
              "tnum font-mono text-xs",
              row.requiresReplan && "text-destructive",
            )}
          >
            {row.status === "needs-change"
              ? "Change plan"
              : row.status === "passive"
                ? "Passive"
                : "On track"}
          </span>
        </LeaderRow>
      </Link>
      <p className="text-muted-foreground mt-1 text-xs">
        {basisLabel(row)} · <Money cents={row.basis} />
        {target === null ? " · No target" : ` of ${formatCents(target)}`}
      </p>
      {target !== null && (
        <div className="mt-2">
          <Progress
            value={Math.min(100, Math.max(0, percent))}
            aria-label={`${row.name}: ${percent}% of ${formatCents(target)}`}
            className={cn(
              "h-2",
              row.requiresReplan && "[&>[data-slot=progress-indicator]]:bg-destructive",
            )}
          />
        </div>
      )}
      <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
        {planCopy(row)}
      </p>
    </div>
  );
}

export function GoalOutlookExpanded(context: WidgetContext) {
  const outlook = context.aggregates.goalOutlook(context.today);
  return (
    <div role="group" aria-label={ariaSummary(outlook)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{summary(outlook)}</p>
        <span className="tnum font-mono text-xs">
          <Money cents={outlook.totalMonthly} /> this month
        </span>
      </div>
      <div className="divide-rule mt-3 divide-y">
        {outlook.rows.map((row) => (
          <GoalRow key={row.goalId} row={row} />
        ))}
      </div>
    </div>
  );
}

export function GoalOutlookCompact(context: WidgetContext) {
  const outlook = context.aggregates.goalOutlook(context.today);
  return (
    <div role="group" aria-label={ariaSummary(outlook)}>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>Monthly plan</Eyebrow>
        <span className="tnum font-mono text-xs">
          <Money cents={outlook.totalMonthly} />
        </span>
      </div>
      <div className="mt-2">
        {outlook.rows.slice(0, 4).map((row) => (
          <Link
            key={row.goalId}
            href={focusHref("/goals", row.goalId)}
            className="hover:bg-muted/45 focus-visible:ring-ring/50 -mx-1 block rounded-lg px-1 focus-visible:ring-3 focus-visible:outline-none"
          >
            <LeaderRow label={row.name}>
              <span className="tnum font-mono text-xs">
                {row.progress === null ? "—" : `${Math.round(row.progress * 100)}%`}
              </span>
            </LeaderRow>
          </Link>
        ))}
      </div>
      <Marginalia className="mt-2 text-xs">{summary(outlook)}.</Marginalia>
    </div>
  );
}
