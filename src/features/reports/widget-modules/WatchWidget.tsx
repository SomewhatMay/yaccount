"use client";

import { differenceInCalendarDays } from "date-fns";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CategoryWatch, ContainerWatch } from "@/core/engine";
import { formatCents, parseDollars } from "@/core/money";
import { Eyebrow, LeaderRow, Marginalia, Money } from "@/features/ui";
import { cn } from "@/lib/utils";
import type { WidgetContext } from "../registry";
import { watchSubjectOptions } from "../watch-subjects";

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const monthName = new Intl.DateTimeFormat("en-US", { month: "short" });
const fullMonth = new Intl.DateTimeFormat("en-US", { month: "long" });

function dateLabel(date: string): string {
  return shortDate.format(new Date(`${date}T00:00:00`));
}

function chartMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const dollars = Math.abs(cents) / 100;
  if (dollars >= 1_000) {
    return `${sign}$${new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(dollars)}`;
  }
  return `${sign}$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}

function floorSetting(context: WidgetContext): number | null {
  const value = context.instanceSettings?.floor;
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function saveWithoutFloor(context: WidgetContext): void {
  const { floor: _floor, ...settings } = context.instanceSettings ?? {};
  void context.saveInstanceSettings?.(settings);
}

function saveFloor(event: FormEvent<HTMLFormElement>, context: WidgetContext): void {
  event.preventDefault();
  const input = event.currentTarget.elements.namedItem("floor");
  if (!(input instanceof HTMLInputElement)) return;
  try {
    const floor = parseDollars(input.value);
    input.setCustomValidity("");
    void context.saveInstanceSettings?.({ ...context.instanceSettings, floor });
  } catch {
    input.setCustomValidity("Enter a dollar amount.");
    input.reportValidity();
  }
}

function SubjectPicker({
  context,
  type,
}: {
  context: WidgetContext;
  type: "container" | "category";
}) {
  const options = watchSubjectOptions(type, context.containers, context.categories);
  const current = options.some((option) => option.id === context.instanceSubject?.id)
    ? context.instanceSubject!.id
    : "";
  return (
    <Select
      value={current}
      onValueChange={(id) => void context.saveInstanceSubject?.({ type, id })}
    >
      <SelectTrigger aria-label={`Change watched ${type}`} className="w-full">
        <SelectValue placeholder={`Choose a ${type}`} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MissingSubject({ type }: { type: "container" | "category" }) {
  return (
    <div role="status" className="border-rule rounded-xl border border-dashed p-4">
      <Eyebrow>Choose another {type}</Eyebrow>
      <p className="text-muted-foreground mt-2 text-sm">
        The watched {type} is archived, missing, or no longer reportable.
      </p>
      <Marginalia className="mt-3 text-xs">
        Open widget settings to choose another {type}.
      </Marginalia>
    </div>
  );
}

function ContainerHeader({ name }: { name: string }) {
  return <Eyebrow as="h3">Watch: {name}</Eyebrow>;
}

function ContainerChart({
  result,
  compact = false,
}: {
  result: ContainerWatch;
  compact?: boolean;
}) {
  const balances = [
    result.currentBalance,
    ...result.forecast.events.map((event) => event.balanceAfter),
    result.forecast.projectedBalance,
    ...(result.floor === null ? [] : [result.floor]),
  ];
  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const y = (balance: number) => 96 - ((balance - min) / Math.max(1, max - min)) * 76;
  const point = (date: string, balance: number) => {
    const elapsed = differenceInCalendarDays(
      new Date(`${date}T00:00:00`),
      new Date(`${result.forecast.start}T00:00:00`),
    );
    return [36 + (elapsed / result.forecast.days) * 648, y(balance)] as const;
  };
  const points = [
    point(result.forecast.start, result.currentBalance),
    ...result.forecast.events.map((event) => point(event.date, event.balanceAfter)),
    point(result.forecast.end, result.forecast.projectedBalance),
  ];
  return (
    <div className={compact ? "mt-3" : "mt-5"}>
      <svg
        viewBox="0 0 720 112"
        role="img"
        aria-label={`Container forecast from ${formatCents(result.currentBalance)} to ${formatCents(result.forecast.projectedBalance)}; scheduled low ${formatCents(result.forecast.low.balance)}`}
        className={cn("w-full overflow-visible", compact ? "h-16" : "h-28")}
        preserveAspectRatio="none"
      >
        {result.floor !== null && (
          <line
            x1="20"
            x2="700"
            y1={y(result.floor)}
            y2={y(result.floor)}
            className={
              result.floorBreached ? "stroke-destructive" : "stroke-muted-foreground/55"
            }
            strokeWidth="1"
            strokeDasharray="7 5"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polyline
          points={points.map(([x, pointY]) => `${x},${pointY}`).join(" ")}
          fill="none"
          className="stroke-primary"
          strokeWidth="2"
          strokeDasharray="3 5"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={points[0][0]} cy={points[0][1]} r="4" className="fill-primary" />
        {result.forecast.events.map((event, index) => (
          <circle
            key={event.id}
            cx={points[index + 1][0]}
            cy={points[index + 1][1]}
            r="3"
            className={
              result.floor !== null && event.balanceAfter < result.floor
                ? "fill-destructive"
                : "fill-foreground"
            }
          />
        ))}
      </svg>
      <div className="text-muted-foreground -mt-1 flex justify-between font-mono text-[0.6875rem]">
        <span>Today</span>
        <span>{dateLabel(result.forecast.end)}</span>
      </div>
    </div>
  );
}

function FloorEditor({
  context,
  floor,
}: {
  context: WidgetContext;
  floor: number | null;
}) {
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      onSubmit={(event) => saveFloor(event, context)}
    >
      <label className="grid gap-1">
        <span className="text-muted-foreground">Floor amount</span>
        <Input
          name="floor"
          inputMode="decimal"
          aria-label="Container floor amount"
          defaultValue={floor === null ? "" : (floor / 100).toFixed(2)}
          placeholder="0.00"
          className="h-8 w-32 font-mono"
        />
      </label>
      <Button type="submit" size="sm" className="h-8">
        Save floor
      </Button>
      {floor !== null && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => saveWithoutFloor(context)}
        >
          Remove floor
        </Button>
      )}
    </form>
  );
}

function containerResult(context: WidgetContext) {
  const id =
    context.instanceSubject?.type === "container" ? context.instanceSubject.id : null;
  const container = context.containers.find(
    (candidate) => candidate.id === id && !candidate.is_archived,
  );
  if (!container) return null;
  const floor = floorSetting(context);
  return {
    container,
    floor,
    result: context.aggregates.containerWatch(container.id, context.today, floor),
  };
}

export function ContainerWatchExpanded(context: WidgetContext) {
  const resolved = containerResult(context);
  if (!resolved) return MissingSubject({ type: "container" });
  const { container, floor, result } = resolved;
  return (
    <div>
      <ContainerHeader name={container.name} />
      <div className="mt-4">
        <Eyebrow>Current balance</Eyebrow>
        <p aria-label={`Current balance: ${formatCents(result.currentBalance)}`}>
          <Money cents={result.currentBalance} className="figure-lg mt-1" />
        </p>
      </div>
      <ContainerChart result={result} />
      <div className="mt-4">
        <div aria-label={`30-day net flow: ${formatCents(result.netFlow30Days)}`}>
          <LeaderRow label="30-day net flow">
            <Money cents={result.netFlow30Days} tone="quiet" />
          </LeaderRow>
        </div>
        <div
          aria-label={`Scheduled low: ${formatCents(result.forecast.low.balance)} on ${dateLabel(result.forecast.low.date)}`}
        >
          <LeaderRow label="Scheduled low">
            <span className="tnum font-mono text-xs">
              {formatCents(result.forecast.low.balance)} ·{" "}
              {dateLabel(result.forecast.low.date)}
            </span>
          </LeaderRow>
        </div>
        {floor === null ? (
          <LeaderRow label="Your floor">
            <span className="text-muted-foreground text-xs">Not set</span>
          </LeaderRow>
        ) : (
          <>
            <div aria-label={`User floor: ${formatCents(floor)}`}>
              <LeaderRow label="Your floor">
                <span className="tnum font-mono text-xs">{formatCents(floor)}</span>
              </LeaderRow>
            </div>
            <div
              aria-label={`Distance above your floor: ${formatCents(result.distanceAboveFloor!)}`}
            >
              <LeaderRow label="Distance above your floor">
                <span
                  className={cn(
                    "tnum font-mono text-xs",
                    result.floorBreached && "text-destructive",
                  )}
                >
                  {formatCents(result.distanceAboveFloor!)}
                </span>
              </LeaderRow>
            </div>
          </>
        )}
      </div>
      <Marginalia className="mt-3 text-xs">
        Floor is your setting; forecast uses scheduled items only.
      </Marginalia>
    </div>
  );
}

export function ContainerWatchCompact(context: WidgetContext) {
  const resolved = containerResult(context);
  if (!resolved) return MissingSubject({ type: "container" });
  const { container, result } = resolved;
  return (
    <div>
      <ContainerHeader name={container.name} />
      <p aria-label={`Current balance: ${formatCents(result.currentBalance)}`}>
        <Money cents={result.currentBalance} className="figure-md mt-3" />
      </p>
      <ContainerChart result={result} compact />
      <p
        aria-label={`Low ${formatCents(result.forecast.low.balance)}`}
        className="text-muted-foreground mt-2 text-xs"
      >
        Low{" "}
        <span className="tnum font-mono">{formatCents(result.forecast.low.balance)}</span>
      </p>
      <p
        aria-label={
          result.distanceAboveFloor === null
            ? "No container floor set"
            : `${formatCents(result.distanceAboveFloor)} ${result.floorBreached ? "below" : "above"} your floor`
        }
        className={cn("mt-1 text-xs", result.floorBreached && "text-destructive")}
      >
        {result.distanceAboveFloor === null ? (
          "Set a floor to measure this forecast."
        ) : (
          <>
            <span className="tnum font-mono">
              {formatCents(result.distanceAboveFloor)}
            </span>{" "}
            {result.floorBreached ? "below" : "above"} your floor
          </>
        )}
      </p>
    </div>
  );
}

function CategoryHeader({ name }: { name: string }) {
  return <Eyebrow as="h3">Watch: {name}</Eyebrow>;
}

function categoryResult(context: WidgetContext) {
  const id =
    context.instanceSubject?.type === "category" ? context.instanceSubject.id : null;
  const category = context.categories.find(
    (candidate) =>
      candidate.id === id &&
      candidate.type === "expense" &&
      !candidate.is_archived &&
      !candidate.excluded_from_stats,
  );
  if (!category) return null;
  return {
    category,
    result: context.aggregates.categoryWatch(category.id, context.today),
  };
}

function CategoryChart({ result }: { result: CategoryWatch }) {
  const max = Math.max(
    1,
    ...result.months.flatMap((month) => [month.spent, month.budget ?? 0]),
  );
  return (
    <div
      role="img"
      aria-label={`Last six months of spending; ${result.months
        .map((month) => `${month.month}: ${formatCents(month.spent)}`)
        .join(", ")}`}
      className="mt-5 grid grid-cols-6 gap-2"
    >
      {result.months.map((month) => (
        <div key={month.month} className="min-w-0 text-center">
          <span className="text-muted-foreground block text-[0.6875rem]">
            {monthName.format(new Date(`${month.month}-01T00:00:00`))}
          </span>
          <span className="mt-1 block font-mono text-[0.6875rem]">
            {chartMoney(month.spent)}
          </span>
          <span className="relative mt-2 block h-20" aria-hidden>
            {month.budget !== null && (
              <span
                className="border-muted-foreground/55 absolute right-0 left-0 border-t border-dashed"
                style={{ bottom: `${(month.budget / max) * 100}%` }}
              />
            )}
            <span
              className={cn(
                "bg-primary absolute right-[20%] bottom-0 left-[20%] rounded-t-sm",
                month.partial && "opacity-65",
              )}
              style={{ height: `${Math.max(2, (month.spent / max) * 100)}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

function SpendingFigure({ result }: { result: CategoryWatch }) {
  const label =
    result.budget === null
      ? `${fullMonth.format(new Date(`${result.yearMonth}-01T00:00:00`))} spending: ${formatCents(result.spent)}`
      : `${fullMonth.format(new Date(`${result.yearMonth}-01T00:00:00`))} spending: ${formatCents(result.spent)} of ${formatCents(result.budget)}`;
  return (
    <div className="mt-4">
      <Eyebrow>
        {fullMonth.format(new Date(`${result.yearMonth}-01T00:00:00`))} spending
      </Eyebrow>
      <p aria-label={label} className="mt-1 flex flex-wrap items-baseline gap-2">
        <Money cents={result.spent} className="figure-lg" />
        {result.budget !== null && (
          <span className="text-muted-foreground font-mono text-sm">
            of {formatCents(result.budget)}
          </span>
        )}
      </p>
      {result.budget !== null && (
        <div className="bg-muted mt-3 h-2 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, (result.spent / Math.max(1, result.budget)) * 100))}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

export function CategoryWatchExpanded(context: WidgetContext) {
  const resolved = categoryResult(context);
  if (!resolved) return MissingSubject({ type: "category" });
  const { category, result } = resolved;
  return (
    <div>
      <CategoryHeader name={category.name} />
      <SpendingFigure result={result} />
      <section className="mt-5" aria-labelledby="category-watch-history">
        <Eyebrow id="category-watch-history" as="h3">
          Last 6 months
        </Eyebrow>
        <CategoryChart result={result} />
      </section>
      <div className="mt-5">
        <div aria-label={`Likely month end: ${formatCents(result.likelyMonthEnd)}`}>
          <LeaderRow label="Likely month end">
            <Money cents={result.likelyMonthEnd} tone="quiet" />
          </LeaderRow>
        </div>
        <div aria-label={`Six-month median: ${formatCents(result.sixMonthMedian)}`}>
          <LeaderRow label="Six-month median">
            <Money cents={result.sixMonthMedian} tone="quiet" />
          </LeaderRow>
        </div>
        <div aria-label={`Recent 7-day spend: ${formatCents(result.recent7DaySpend)}`}>
          <LeaderRow label="Recent 7-day spend">
            <Money cents={result.recent7DaySpend} tone="quiet" />
          </LeaderRow>
        </div>
      </div>
      <Marginalia className="mt-3 text-xs">
        Likely month end uses your recent 7-day pace; refunds stay signed.
        {result.budget !== null &&
          ` ${formatCents(result.budget)} is the current budget.`}
      </Marginalia>
    </div>
  );
}

export function CategoryWatchCompact(context: WidgetContext) {
  const resolved = categoryResult(context);
  if (!resolved) return MissingSubject({ type: "category" });
  const { category, result } = resolved;
  return (
    <div>
      <CategoryHeader name={category.name} />
      <p
        aria-label={
          result.budget === null
            ? formatCents(result.spent)
            : `${formatCents(result.spent)} of ${formatCents(result.budget)}`
        }
        className="mt-3 flex flex-wrap items-baseline gap-2"
      >
        <Money cents={result.spent} className="figure-md" />
        {result.budget !== null && (
          <span className="text-muted-foreground font-mono text-xs">
            of {formatCents(result.budget)}
          </span>
        )}
      </p>
      {result.budget !== null && (
        <div className="bg-muted mt-3 h-2 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, (result.spent / Math.max(1, result.budget)) * 100))}%`,
            }}
          />
        </div>
      )}
      <p
        aria-label={`Likely ${formatCents(result.likelyMonthEnd)}${result.remaining === null ? "" : `; ${formatCents(result.remaining)} left`}`}
        className="text-muted-foreground mt-3 text-xs"
      >
        Likely{" "}
        <span className="tnum font-mono">{formatCents(result.likelyMonthEnd)}</span>
        {result.remaining !== null && (
          <>
            ; <span className="tnum font-mono">{formatCents(result.remaining)}</span> left
          </>
        )}
      </p>
    </div>
  );
}

export function ContainerWatchSettings(context: WidgetContext) {
  const floor = floorSetting(context);
  return (
    <div className="space-y-6">
      <section>
        <Eyebrow as="h3">Watched container</Eyebrow>
        <div className="mt-2">{SubjectPicker({ context, type: "container" })}</div>
      </section>
      <section className="border-t pt-4">
        <Eyebrow as="h3">Floor amount</Eyebrow>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Compare the scheduled low against a floor you choose.
        </p>
        <FloorEditor context={context} floor={floor} />
      </section>
    </div>
  );
}

export function CategoryWatchSettings(context: WidgetContext) {
  return (
    <div>
      <Eyebrow as="h3">Watched category</Eyebrow>
      <div className="mt-2">{SubjectPicker({ context, type: "category" })}</div>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
        Current spending, budget progress, and history stay scoped to this category.
      </p>
    </div>
  );
}
