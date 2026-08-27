"use client";

import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { Button } from "@/components/ui/button";
import type { CashHorizon, CashHorizonDays, CashHorizonEvent } from "@/core/engine";
import { formatCents } from "@/core/money";
import { focusHref } from "@/features/focus-link";
import { Eyebrow, LeaderRow, Marginalia, Money } from "@/features/ui";
import { cn } from "@/lib/utils";
import type { WidgetContext } from "../registry";

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const HORIZONS: CashHorizonDays[] = [14, 30, 60];

function dateLabel(date: string): string {
  return shortDate.format(new Date(`${date}T00:00:00`));
}

function horizonDays(context: WidgetContext): CashHorizonDays {
  const value = context.instanceSettings?.horizonDays;
  return value === 14 || value === 30 || value === 60 ? value : 30;
}

function signedMoney(amount: number): string {
  return `${amount > 0 ? "+" : ""}${formatCents(amount)}`;
}

function eventHref(event: CashHorizonEvent): string {
  if (event.source === "pending") return "/inbox";
  if (event.source === "recurring" && event.ruleId) {
    return focusHref("/recurring", event.ruleId);
  }
  return event.transactionId ? focusHref("/ledger", event.transactionId) : "/recurring";
}

function saveHorizon(context: WidgetContext, days: CashHorizonDays): void {
  void context.saveInstanceSettings?.({
    ...context.instanceSettings,
    horizonDays: days,
  });
}

function HorizonPicker({ context, days }: { context: WidgetContext; days: number }) {
  return (
    <div className="bg-muted/50 flex rounded-full p-0.5" aria-label="Forecast window">
      {HORIZONS.map((candidate) => (
        <Button
          key={candidate}
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Forecast ${candidate} days`}
          aria-pressed={candidate === days}
          className={cn(
            "h-7 rounded-full px-2.5 font-mono text-xs",
            candidate === days && "bg-background shadow-xs",
          )}
          onClick={() => saveHorizon(context, candidate)}
        >
          {candidate}d
        </Button>
      ))}
    </div>
  );
}

function chartPoint(
  date: string,
  balance: number,
  horizon: CashHorizon,
  min: number,
  max: number,
): [number, number] {
  const elapsed = differenceInCalendarDays(
    new Date(`${date}T00:00:00`),
    new Date(`${horizon.start}T00:00:00`),
  );
  const x = 14 + (Math.min(horizon.days, Math.max(0, elapsed)) / horizon.days) * 692;
  const y = 104 - ((balance - min) / Math.max(1, max - min)) * 88;
  return [x, y];
}

function HorizonChart({
  horizon,
  compact = false,
}: {
  horizon: CashHorizon;
  compact?: boolean;
}) {
  const balances = [
    horizon.startingBalance,
    ...horizon.events.map((event) => event.balanceAfter),
    0,
  ];
  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const points = [
    chartPoint(horizon.start, horizon.startingBalance, horizon, min, max),
    ...horizon.events.map((event) =>
      chartPoint(event.date, event.balanceAfter, horizon, min, max),
    ),
    chartPoint(horizon.end, horizon.projectedBalance, horizon, min, max),
  ];
  const path = points.map(([x, y]) => `${x},${y}`).join(" ");
  const zeroY = chartPoint(horizon.start, 0, horizon, min, max)[1];

  return (
    <div className="mt-4">
      <svg
        viewBox="0 0 720 120"
        role="img"
        aria-label={`Cash forecast from ${dateLabel(horizon.start)} to ${dateLabel(horizon.end)}`}
        className={cn("w-full overflow-visible", compact ? "h-20" : "h-32")}
        preserveAspectRatio="none"
      >
        <line
          x1="14"
          x2="706"
          y1={zeroY}
          y2={zeroY}
          className="stroke-border"
          strokeWidth="1"
        />
        <polyline
          points={path}
          fill="none"
          className="stroke-primary"
          strokeWidth="2"
          strokeDasharray="3 5"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={points[0][0]} cy={points[0][1]} r="4" className="fill-primary" />
        {horizon.events.map((event, index) => (
          <circle
            key={event.id}
            cx={points[index + 1][0]}
            cy={points[index + 1][1]}
            r="3"
            className={event.balanceAfter < 0 ? "fill-destructive" : "fill-foreground"}
          />
        ))}
      </svg>
      <div className="text-muted-foreground -mt-1 flex justify-between gap-3 font-mono text-[0.6875rem]">
        <span aria-label={`Today: ${formatCents(horizon.startingBalance)}`}>
          Today · {formatCents(horizon.startingBalance)}
        </span>
        <span
          aria-label={`${dateLabel(horizon.end)}: ${formatCents(horizon.projectedBalance)}`}
          className="text-right"
        >
          {dateLabel(horizon.end)} · {formatCents(horizon.projectedBalance)}
        </span>
      </div>
    </div>
  );
}

function EventRow({ event }: { event: CashHorizonEvent }) {
  return (
    <Link
      href={eventHref(event)}
      className="hover:bg-muted/45 focus-visible:ring-ring/50 -mx-1 block rounded-lg px-1 focus-visible:ring-3 focus-visible:outline-none"
    >
      <LeaderRow label={`${dateLabel(event.date)} · ${event.label}`}>
        <span className="tnum font-mono text-xs">
          {event.amount === 0 ? "No total change" : signedMoney(event.amount)}
        </span>
      </LeaderRow>
    </Link>
  );
}

function NextIncome({ horizon }: { horizon: CashHorizon }) {
  const income = horizon.nextIncome;
  if (!income) {
    return (
      <Marginalia marks={false} className="mt-4 text-xs">
        No known income in this window.
      </Marginalia>
    );
  }
  const days = differenceInCalendarDays(
    new Date(`${income.date}T00:00:00`),
    new Date(`${horizon.start}T00:00:00`),
  );
  const bills = horizon.billsBeforeNextIncome;
  return (
    <div className="mt-4 border-t pt-3">
      <Eyebrow>Next income in {days} days</Eyebrow>
      <LeaderRow label={`${dateLabel(income.date)} · ${income.label}`}>
        <span className="tnum font-mono text-xs">{signedMoney(income.amount)}</span>
      </LeaderRow>
      <p
        aria-label={`${bills.count} ${bills.count === 1 ? "bill" : "bills"} before then: ${formatCents(bills.amount)}`}
        className="text-muted-foreground mt-1 text-xs"
      >
        {bills.count} {bills.count === 1 ? "bill" : "bills"} before then:{" "}
        <span className="tnum font-mono">{formatCents(bills.amount)}</span>
      </p>
    </div>
  );
}

function RiskNote({ horizon }: { horizon: CashHorizon }) {
  if (!horizon.firstBelowZero) return null;
  return (
    <p className="text-destructive mt-2 text-sm font-medium">
      Below zero {dateLabel(horizon.firstBelowZero.date)} · largest shortfall{" "}
      <span className="tnum font-mono">{formatCents(horizon.largestShortfall)}</span>
    </p>
  );
}

export function CashHorizonExpanded(context: WidgetContext) {
  const days = horizonDays(context);
  const horizon = context.aggregates.cashHorizon(context.today, days);
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Projected low</Eyebrow>
          <p
            aria-label={`${formatCents(horizon.low.balance)} on ${dateLabel(horizon.low.date)}`}
            className="font-display mt-1 text-2xl font-semibold tracking-tight"
          >
            <Money cents={horizon.low.balance} />{" "}
            <span className="text-muted-foreground text-base font-normal">
              on {dateLabel(horizon.low.date)}
            </span>
          </p>
          <RiskNote horizon={horizon} />
        </div>
      </div>

      <HorizonChart horizon={horizon} />
      <div className="divide-rule divide-y">
        {horizon.events.slice(0, 6).map((event) => (
          <div key={event.id}>
            <EventRow event={event} />
          </div>
        ))}
      </div>
      {horizon.events.length > 6 && (
        <Marginalia className="mt-2 text-xs">
          {horizon.events.length - 6} more known events in this window.
        </Marginalia>
      )}
      <NextIncome horizon={horizon} />
      {horizon.unknownEvents.length > 0 && (
        <Marginalia className="mt-3 text-xs">
          {horizon.unknownEvents.length} scheduled{" "}
          {horizon.unknownEvents.length === 1 ? "amount is" : "amounts are"} set later.
        </Marginalia>
      )}
      <Marginalia className="mt-4 text-xs">
        Scheduled items only; ordinary card spending is not predicted.
      </Marginalia>
    </div>
  );
}

export function CashHorizonCompact(context: WidgetContext) {
  const days = horizonDays(context);
  const horizon = context.aggregates.cashHorizon(context.today, days);
  const income = horizon.nextIncome;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>{days} days</Eyebrow>
        <span className="text-muted-foreground tnum font-mono text-xs">
          Ends {formatCents(horizon.projectedBalance)}
        </span>
      </div>
      <p
        aria-label={`Low: ${formatCents(horizon.low.balance)} on ${dateLabel(horizon.low.date)}`}
        className="mt-2 text-sm font-medium"
      >
        Low: <Money cents={horizon.low.balance} /> on {dateLabel(horizon.low.date)}
      </p>
      <RiskNote horizon={horizon} />
      <HorizonChart horizon={horizon} compact />
      <p className="mt-1 text-xs">
        {income
          ? `Next income: ${dateLabel(income.date)}, ${signedMoney(income.amount)}`
          : "No known income in this window."}
      </p>
      {income && (
        <p className="text-muted-foreground mt-1 text-xs">
          {horizon.billsBeforeNextIncome.count}{" "}
          {horizon.billsBeforeNextIncome.count === 1 ? "bill" : "bills"} before then:{" "}
          <span className="tnum font-mono">
            {formatCents(horizon.billsBeforeNextIncome.amount)}
          </span>
        </p>
      )}
    </div>
  );
}

export function CashHorizonSettings(context: WidgetContext) {
  const days = horizonDays(context);
  return (
    <div>
      <Eyebrow>Forecast window</Eyebrow>
      <div className="mt-2 flex justify-start">
        <HorizonPicker context={context} days={days} />
      </div>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
        Include known cash events over the next 14, 30, or 60 days.
      </p>
    </div>
  );
}
