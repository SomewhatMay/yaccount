"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MoneyBrief, MoneyBriefItem } from "@/core/engine";
import { formatCents } from "@/core/money";
import { focusHref } from "@/features/focus-link";
import { Eyebrow, Marginalia } from "@/features/ui";
import { cn } from "@/lib/utils";
import type { WidgetContext } from "../registry";

const dayLabel = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
});
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function dateLabel(date: string): string {
  return shortDate.format(new Date(`${date}T00:00:00`));
}

function brief(context: WidgetContext): MoneyBrief {
  return context.aggregates.moneyBrief(context.today);
}

function actionHref(item: MoneyBriefItem): string {
  const base = `/${item.action.screen}`;
  return item.action.focusId ? focusHref(base, item.action.focusId) : base;
}

function itemCopy(
  item: MoneyBriefItem,
  compact: boolean,
): { title: string; detail: string } {
  if (item.kind === "cash-risk") {
    return {
      title: compact
        ? `Cash below zero ${dateLabel(item.date)}`
        : `Known cash falls below zero on ${dateLabel(item.date)}.`,
      detail: `Largest known shortfall ${formatCents(item.shortfall)}.`,
    };
  }
  if (item.kind === "pending") {
    return {
      title: compact
        ? `${item.count} pending ${item.count === 1 ? "entry" : "entries"}`
        : `${item.count} pending ${item.count === 1 ? "entry is" : "entries are"} ready to review.`,
      detail: "Complete pending ledger.",
    };
  }
  if (item.kind === "budget") {
    const over =
      item.status === "spent" ? item.spent - item.budget : item.projected - item.budget;
    return {
      title: compact
        ? `${item.name}: ${formatCents(item.remaining)} left`
        : item.status === "spent"
          ? `${item.name} is ${formatCents(over)} over its budget.`
          : `${item.name} is projected ${formatCents(over)} over this month.`,
      detail: `${formatCents(item.remaining)} left`,
    };
  }
  const affected = item.staleCount + item.missingCount;
  const title =
    item.missingCount > 0 && item.staleCount > 0
      ? `${affected} investment values need refreshing.`
      : item.missingCount > 0
        ? `${item.missingCount} ${item.missingCount === 1 ? "investment has" : "investments have"} no reported value.`
        : `Investment ${item.staleCount === 1 ? "value is" : "values are"} ${item.oldestAgeDays} days old.`;
  return {
    title,
    detail:
      item.oldestAgeDays === null
        ? "Report a value to restore freshness."
        : `Oldest value is ${item.oldestAgeDays} days old.`,
  };
}

function marker(item: MoneyBriefItem): string {
  if (item.kind === "pending") return "□";
  if (item.kind === "stale-values") return "~";
  return "!";
}

function BriefItemRow({
  item,
  compact = false,
}: {
  item: MoneyBriefItem;
  compact?: boolean;
}) {
  const copy = itemCopy(item, compact);
  return (
    <Link
      href={actionHref(item)}
      className="hover:bg-muted/45 focus-visible:ring-ring/50 -mx-2 flex items-start gap-3 rounded-lg px-2 py-2 focus-visible:ring-3 focus-visible:outline-none"
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center font-mono text-xs",
          item.kind === "cash-risk" && "text-destructive",
        )}
      >
        {marker(item)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-snug">{copy.title}</span>
        {!compact && (
          <span className="text-muted-foreground mt-0.5 block text-xs">
            {copy.detail}
          </span>
        )}
      </span>
      <ArrowRightIcon
        className="text-muted-foreground mt-1 size-3.5 shrink-0"
        aria-hidden
      />
    </Link>
  );
}

function AllClear({
  result,
  compact = false,
}: {
  result: MoneyBrief;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mt-3" : "mt-4"}>
      <p className="text-sm font-medium">Nothing needs you right now.</p>
      {result.nextKnownBill ? (
        <p
          aria-label={`Next known bill: ${result.nextKnownBill.label}, ${dateLabel(result.nextKnownBill.date)} · ${formatCents(result.nextKnownBill.amount)}`}
          className="text-muted-foreground mt-2 text-xs"
        >
          Next known bill: {result.nextKnownBill.label},{" "}
          {dateLabel(result.nextKnownBill.date)} ·{" "}
          <span className="tnum font-mono">
            {formatCents(result.nextKnownBill.amount)}
          </span>
        </p>
      ) : result.hasScheduledContext ? (
        <p className="text-muted-foreground mt-2 text-xs">
          No known bill in the next 30 days.
        </p>
      ) : (
        <p className="text-muted-foreground mt-2 text-xs">
          No scheduled context yet.{" "}
          <Link
            href="/recurring"
            className="text-foreground underline underline-offset-2"
          >
            Add recurring items
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function countLabel(count: number, compact = false): string {
  if (compact) return `${count} need you`;
  return `${count} ${count === 1 ? "thing needs" : "things need"} you`;
}

export function MoneyBriefExpanded(context: WidgetContext) {
  const result = brief(context);
  const first = result.items[0];
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Today&apos;s note</Eyebrow>
          <p className="text-muted-foreground mt-1 text-xs">
            {dayLabel.format(new Date(`${context.today}T00:00:00`))}
          </p>
        </div>
        {first && (
          <Button asChild variant="ghost" size="sm">
            <Link href={actionHref(first)}>
              Review <ArrowRightIcon aria-hidden />
            </Link>
          </Button>
        )}
      </div>
      {result.totalItems === 0 ? (
        <AllClear result={result} />
      ) : (
        <>
          <p className="mt-4 font-medium">{countLabel(result.totalItems)}</p>
          <div className="divide-rule mt-2 divide-y">
            {result.items.map((item, index) => (
              <BriefItemRow key={`${item.kind}:${index}`} item={item} />
            ))}
          </div>
          <Marginalia className="mt-3 text-xs">
            {result.hiddenItemCount > 0
              ? `${result.hiddenItemCount} more ${result.hiddenItemCount === 1 ? "matter" : "matters"}; Review opens the highest-priority source.`
              : "Everything else is current."}
          </Marginalia>
        </>
      )}
    </div>
  );
}

export function MoneyBriefCompact(context: WidgetContext) {
  const result = brief(context);
  return (
    <div>
      {result.totalItems === 0 ? (
        <AllClear result={result} compact />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <Eyebrow>Today&apos;s note</Eyebrow>
            <span className="text-muted-foreground text-xs">
              {countLabel(result.totalItems, true)}
            </span>
          </div>
          <div className="divide-rule mt-2 divide-y">
            {result.items.map((item, index) => (
              <BriefItemRow key={`${item.kind}:${index}`} item={item} compact />
            ))}
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            {result.hiddenItemCount > 0
              ? `${result.hiddenItemCount} more in Review.`
              : "Everything else is current."}
          </p>
        </>
      )}
    </div>
  );
}
