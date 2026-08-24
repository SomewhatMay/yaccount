"use client";

import { differenceInCalendarDays } from "date-fns";
import type { MonthLanding } from "@/core/engine";
import { formatCents } from "@/core/money";
import { Eyebrow, LeaderRow, Marginalia, Money } from "@/features/ui";
import { cn } from "@/lib/utils";
import type { WidgetContext } from "../registry";

const monthYear = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const monthDay = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
});

function dateValue(date: string): Date {
  return new Date(date + "T00:00:00");
}

function monthLabel(landing: MonthLanding): string {
  return monthYear.format(dateValue(landing.start));
}

function endLabel(landing: MonthLanding): string {
  return monthDay.format(dateValue(landing.end));
}

function signedMoney(amount: number): string {
  return (amount > 0 ? "+" : "") + formatCents(amount);
}

function Runway({
  landing,
  compact = false,
}: {
  landing: MonthLanding;
  compact?: boolean;
}) {
  const forecast = [{ date: landing.today, kept: landing.keptSoFar }];
  let scheduledKept = landing.keptSoFar;
  const remainingDays = Math.max(
    1,
    differenceInCalendarDays(dateValue(landing.end), dateValue(landing.today)),
  );
  for (const item of landing.scheduledItems) {
    scheduledKept += item.amount;
    const date = item.date < landing.today ? landing.today : item.date;
    const elapsed = differenceInCalendarDays(dateValue(date), dateValue(landing.today));
    const inferred = ((landing.usualFlexibleSpending ?? 0) * elapsed) / remainingDays;
    forecast.push({ date, kept: scheduledKept - inferred });
  }
  if (forecast.at(-1)?.date !== landing.end) {
    forecast.push({ date: landing.end, kept: landing.likelyKept });
  }
  const values = [
    0,
    ...landing.actualPoints.map((point) => point.kept),
    ...forecast.map((point) => point.kept),
    landing.likelyKept,
    ...(landing.expectedRange
      ? [landing.expectedRange.low, landing.expectedRange.high]
      : []),
  ];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (date: string) => {
    const day = differenceInCalendarDays(dateValue(date), dateValue(landing.start));
    return (
      18 +
      (Math.max(0, Math.min(landing.daysInMonth - 1, day)) /
        Math.max(1, landing.daysInMonth - 1)) *
        684
    );
  };
  const y = (value: number) => 105 - ((value - min) / Math.max(1, max - min)) * 86;
  const pointText = (date: string, kept: number) => x(date) + "," + y(kept);
  const actualPoints = landing.actualPoints
    .map((point) => pointText(point.date, point.kept))
    .join(" ");
  const forecastPoints = [
    ...forecast.map((point) => pointText(point.date, point.kept)),
  ].join(" ");
  const todayPoint = landing.actualPoints.at(-1)!;
  const endX = x(landing.end);
  const likelyY = y(landing.likelyKept);
  const todayFraction =
    differenceInCalendarDays(dateValue(landing.today), dateValue(landing.start)) /
    Math.max(1, landing.daysInMonth - 1);

  return (
    <div className={compact ? "mt-3" : "mt-5"}>
      <svg
        viewBox="0 0 720 120"
        role="img"
        aria-label={
          "Month runway from " +
          formatCents(landing.keptSoFar) +
          " kept so far to " +
          formatCents(landing.likelyKept) +
          " likely kept"
        }
        className={cn("w-full overflow-visible", compact ? "h-14" : "h-32")}
        preserveAspectRatio="none"
      >
        <line
          x1="18"
          x2="702"
          y1={y(0)}
          y2={y(0)}
          className="stroke-border"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={actualPoints}
          fill="none"
          className="stroke-foreground"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={forecastPoints}
          fill="none"
          className="stroke-primary"
          strokeWidth="2"
          strokeDasharray="3 5"
          vectorEffect="non-scaling-stroke"
        />
        {landing.expectedRange && (
          <line
            x1={endX}
            x2={endX}
            y1={y(landing.expectedRange.high)}
            y2={y(landing.expectedRange.low)}
            className="stroke-muted-foreground"
            strokeWidth="10"
            strokeLinecap="square"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <circle
          cx={x(todayPoint.date)}
          cy={y(todayPoint.kept)}
          r="4"
          className="fill-background stroke-foreground"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={"M " + (endX - 4) + " " + (likelyY - 4) + " l 8 8 m 0 -8 l -8 8"}
          className="stroke-primary"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {!compact && (
        <div className="text-muted-foreground relative -mt-1 h-4 font-mono text-[0.6875rem]">
          <span className="absolute left-0">
            {monthDay.format(dateValue(landing.start))}
          </span>
          <span
            className={cn(
              "absolute",
              todayFraction > 0.65 ? "-translate-x-full pr-1" : "-translate-x-1/2",
            )}
            style={{ left: todayFraction * 100 + "%" }}
          >
            Today
          </span>
          <span className="absolute right-0">{endLabel(landing)}</span>
        </div>
      )}
    </div>
  );
}

function AmountRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div aria-label={label + ": " + signedMoney(amount)}>
      <LeaderRow label={label}>
        <Money cents={amount} showPlus tone="quiet" />
      </LeaderRow>
    </div>
  );
}

function EstimateNote({ landing }: { landing: MonthLanding }) {
  if (landing.estimate === "full") {
    return (
      <Marginalia className="mt-3 text-xs">
        Flexible range uses the last 3 comparable months.
      </Marginalia>
    );
  }
  if (landing.estimate === "early") {
    return (
      <Marginalia className="mt-3 text-xs">
        Early estimate · Flexible range uses 2 complete months.
      </Marginalia>
    );
  }
  return (
    <Marginalia className="mt-3 text-xs">
      Early estimate · Scheduled items only; more history will add a range.
    </Marginalia>
  );
}

export function MonthLandingExpanded(context: WidgetContext) {
  const landing = context.aggregates.monthLanding(context.today);
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Likely kept</Eyebrow>
          <p aria-label={"Likely kept: " + formatCents(landing.likelyKept)}>
            <Money
              cents={landing.likelyKept}
              tone={landing.likelyKept < 0 ? "alert" : "neutral"}
              className="figure-lg mt-1"
            />
          </p>
          {landing.expectedRange && (
            <p
              aria-label={
                "Expected range: " +
                formatCents(landing.expectedRange.low) +
                " to " +
                formatCents(landing.expectedRange.high)
              }
              className="text-muted-foreground mt-1 text-sm"
            >
              Expected range ·{" "}
              <span className="tnum font-mono">
                {formatCents(landing.expectedRange.low)} –{" "}
                {formatCents(landing.expectedRange.high)}
              </span>
            </p>
          )}
        </div>
        <Eyebrow>{monthLabel(landing)}</Eyebrow>
      </div>
      <Runway landing={landing} />
      <div className="mt-5">
        <AmountRow label="Kept so far" amount={landing.keptSoFar} />
        <AmountRow
          label="Remaining scheduled net"
          amount={landing.remainingScheduledNet}
        />
        {landing.usualFlexibleSpending !== null && (
          <AmountRow
            label="Usual flexible spending"
            amount={-landing.usualFlexibleSpending}
          />
        )}
      </div>
      <div
        aria-label={"Likely kept: " + formatCents(landing.likelyKept)}
        className="rule-double mt-3 flex items-baseline justify-between gap-4 pt-2"
      >
        <Eyebrow as="span">Likely kept</Eyebrow>
        <Money
          cents={landing.likelyKept}
          tone={landing.likelyKept < 0 ? "alert" : "neutral"}
          className="figure-md"
        />
      </div>
      <EstimateNote landing={landing} />
    </div>
  );
}

export function MonthLandingCompact(context: WidgetContext) {
  const landing = context.aggregates.monthLanding(context.today);
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>Likely kept</Eyebrow>
          <p aria-label={"Likely kept: " + formatCents(landing.likelyKept)}>
            <Money
              cents={landing.likelyKept}
              tone={landing.likelyKept < 0 ? "alert" : "neutral"}
              className="figure-md mt-1"
            />
          </p>
        </div>
        <span className="text-muted-foreground text-xs">{endLabel(landing)}</span>
      </div>
      {landing.expectedRange && (
        <p className="text-muted-foreground mt-2 text-xs">
          Range ·{" "}
          <span className="tnum font-mono">
            {formatCents(landing.expectedRange.low)} –{" "}
            {formatCents(landing.expectedRange.high)}
          </span>
        </p>
      )}
      <Runway landing={landing} compact />
      <p
        aria-label={
          "Known " +
          signedMoney(landing.remainingScheduledNet) +
          (landing.usualFlexibleSpending !== null
            ? "; usual " + signedMoney(-landing.usualFlexibleSpending)
            : "")
        }
        className="text-muted-foreground mt-2 text-xs"
      >
        Known{" "}
        <span className="tnum font-mono">
          {signedMoney(landing.remainingScheduledNet)}
        </span>
        {landing.usualFlexibleSpending !== null && (
          <>
            ; usual{" "}
            <span className="tnum font-mono">
              {signedMoney(-landing.usualFlexibleSpending)}
            </span>
          </>
        )}
      </p>
      {landing.estimate === "scheduled-only" && (
        <p className="text-muted-foreground mt-1 text-xs">Early estimate</p>
      )}
    </div>
  );
}
