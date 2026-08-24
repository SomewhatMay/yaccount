"use client";

import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import type { BudgetTriage, BudgetTriageRow } from "@/core/engine";
import { formatCents } from "@/core/money";
import { ledgerHref } from "@/features/ledger/deep-link";
import { Eyebrow, LeaderRow, Marginalia, Money } from "@/features/ui";
import { cn } from "@/lib/utils";
import type { WidgetContext } from "../registry";

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "long" });
const shortMonthFormat = new Intl.DateTimeFormat("en-US", { month: "short" });

function monthName(today: string, compact = false): string {
  const date = new Date(`${today.slice(0, 7)}-01T00:00:00`);
  return (compact ? shortMonthFormat : monthFormat).format(date);
}

function summary(triage: BudgetTriage): string {
  const attention = triage.counts.needsAttention;
  const watch = triage.counts.watch;
  return `${attention} ${attention === 1 ? "needs" : "need"} attention; ${watch} worth watching; ${triage.counts.onTrack} on track`;
}

function categoryHref(row: BudgetTriageRow, triage: BudgetTriage): string {
  return ledgerHref({
    categoryIds: [row.categoryId],
    range: { start: triage.start, end: triage.end },
  });
}

function balanceCopy(row: BudgetTriageRow): string {
  return row.remaining < 0
    ? `${formatCents(Math.abs(row.remaining))} over`
    : `${formatCents(row.remaining)} left`;
}

function rowNote(row: BudgetTriageRow): string {
  if (row.status === "spent") {
    return `Spent ${formatCents(row.spent - row.budget)} over the allowance.`;
  }
  if (row.status === "projected") {
    const over = row.projected - row.budget;
    const planned =
      row.scheduledRemaining > 0 &&
      row.spent + row.scheduledRemaining >= (row.linearProjection ?? row.spent);
    return `At the current ${planned ? "plan" : "pace"}, about ${formatCents(over)} over by month end.`;
  }
  if (row.scheduled.length === 1) {
    return `${row.scheduled[0].label} remains scheduled for ${formatCents(row.scheduled[0].amount)}.`;
  }
  if (row.scheduled.length > 1) {
    return `${row.scheduled.length} scheduled expenses remain, totaling ${formatCents(row.scheduledRemaining)}.`;
  }
  return `${Math.round((row.spentPct ?? 0) * 100)}% of the allowance used.`;
}

function BudgetRow({ row, triage }: { row: BudgetTriageRow; triage: BudgetTriage }) {
  const spentPct = Math.round((row.spentPct ?? 0) * 100);
  const monthPct = Math.round(row.monthElapsedPct * 100);
  return (
    <div className="py-3">
      <Link
        href={categoryHref(row, triage)}
        className="hover:bg-muted/45 focus-visible:ring-ring/50 -mx-1 block rounded-lg px-1 focus-visible:ring-3 focus-visible:outline-none"
      >
        <LeaderRow label={row.name} className="py-0 font-medium">
          <span className="tnum font-mono text-xs">{balanceCopy(row)}</span>
        </LeaderRow>
      </Link>
      <div className="mt-2">
        <Progress
          value={Math.min(100, Math.max(0, spentPct))}
          aria-label={`${row.name}: ${spentPct}% spent; ${monthPct}% of month elapsed`}
          className={cn(
            "h-2",
            row.status === "spent" && "[&>[data-slot=progress-indicator]]:bg-destructive",
          )}
        />
        <p className="text-muted-foreground tnum mt-1.5 font-mono text-xs">
          {spentPct}% spent / {monthPct}% of month
        </p>
      </div>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{rowNote(row)}</p>
    </div>
  );
}

function OnTrackRows({
  rows,
  triage,
}: {
  rows: BudgetTriageRow[];
  triage: BudgetTriage;
}) {
  if (rows.length === 0) return null;
  return (
    <details className="mt-3">
      <summary className="leaders cursor-pointer list-none py-1.5 text-sm [&::-webkit-details-marker]:hidden">
        <Eyebrow as="span">On track</Eyebrow>
        <span className="tnum font-mono text-xs">{rows.length} · Show</span>
      </summary>
      <div className="mt-1 border-l pl-4">
        {rows.map((row) => (
          <Link key={row.categoryId} href={categoryHref(row, triage)} className="block">
            <LeaderRow label={row.name}>
              <Money cents={row.budget - row.projected} /> buffer
            </LeaderRow>
          </Link>
        ))}
      </div>
    </details>
  );
}

export function BudgetTriageExpanded(context: WidgetContext) {
  const triage = context.aggregates.budgetTriage(context.today);
  const attention = triage.rows.filter(
    (row) => row.status === "spent" || row.status === "projected",
  );
  const watch = triage.rows.filter((row) => row.status === "watch");
  const onTrack = triage.rows.filter((row) => row.status === "on-track");

  return (
    <div role="group" aria-label={summary(triage)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{summary(triage)}</p>
        <span className="text-muted-foreground tnum font-mono text-xs">
          {monthName(context.today)} {triage.elapsedDays} of {triage.daysInMonth}
        </span>
      </div>

      {attention.length > 0 && (
        <section className="mt-5" aria-labelledby="budget-triage-attention">
          <Eyebrow id="budget-triage-attention" as="h3">
            Needs attention
          </Eyebrow>
          <div className="divide-rule mt-1 divide-y">
            {attention.map((row) => (
              <BudgetRow key={row.categoryId} row={row} triage={triage} />
            ))}
          </div>
        </section>
      )}

      {watch.length > 0 && (
        <section className="mt-5" aria-labelledby="budget-triage-watch">
          <Eyebrow id="budget-triage-watch" as="h3">
            Watch
          </Eyebrow>
          <div className="divide-rule mt-1 divide-y">
            {watch.map((row) => (
              <BudgetRow key={row.categoryId} row={row} triage={triage} />
            ))}
          </div>
        </section>
      )}

      <OnTrackRows rows={onTrack} triage={triage} />
    </div>
  );
}

function CompactStatusRow({
  row,
  triage,
}: {
  row: BudgetTriageRow;
  triage: BudgetTriage;
}) {
  const marker = row.status === "watch" ? "·" : "!";
  return (
    <Link
      href={categoryHref(row, triage)}
      className="hover:bg-muted/45 focus-visible:ring-ring/50 -mx-1 block rounded-lg px-1 focus-visible:ring-3 focus-visible:outline-none"
    >
      <LeaderRow label={`${marker} ${row.name}`}>
        <span className="tnum font-mono text-xs">{balanceCopy(row)}</span>
      </LeaderRow>
    </Link>
  );
}

export function BudgetTriageCompact(context: WidgetContext) {
  const triage = context.aggregates.budgetTriage(context.today);
  const active = triage.rows.filter((row) => row.status !== "on-track");
  const onTrack = triage.rows.filter((row) => row.status === "on-track");
  const smallestBuffer = [...onTrack].sort(
    (a, b) => a.budget - a.projected - (b.budget - b.projected),
  )[0];

  if (active.length === 0) {
    return (
      <div role="group" aria-label={summary(triage)}>
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>All clear</Eyebrow>
          <span className="text-muted-foreground tnum font-mono text-xs">
            {monthName(context.today, true)} {triage.elapsedDays} of {triage.daysInMonth}
          </span>
        </div>
        <p className="font-display mt-2 text-xl font-semibold">
          All {triage.rows.length} budgets are on track
        </p>
        {smallestBuffer && (
          <LeaderRow label={`Smallest buffer · ${smallestBuffer.name}`} className="mt-3">
            <Money cents={smallestBuffer.budget - smallestBuffer.projected} />
          </LeaderRow>
        )}
      </div>
    );
  }

  return (
    <div role="group" aria-label={summary(triage)}>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>
          Attention {triage.counts.needsAttention} · Watch {triage.counts.watch}
        </Eyebrow>
        <span className="text-muted-foreground tnum font-mono text-xs">
          {monthName(context.today, true)} {triage.elapsedDays} of {triage.daysInMonth}
        </span>
      </div>
      <div className="mt-2">
        {active.slice(0, 3).map((row) => (
          <CompactStatusRow key={row.categoryId} row={row} triage={triage} />
        ))}
      </div>
      {active.length > 3 && (
        <Marginalia className="mt-2 text-xs">
          {active.length - 3} more need review.
        </Marginalia>
      )}
      <OnTrackRows rows={onTrack} triage={triage} />
    </div>
  );
}
