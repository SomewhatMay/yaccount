"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  linkTransactionToRecurringOccurrence,
  setSetting,
  unvoidTransaction,
  updateTransaction,
  voidTransaction,
} from "@/core/commands";
import type {
  MoneyBrief,
  MoneyBriefItem,
  MonthClose,
  MonthCloseCandidate,
  MonthCloseOccurrence,
} from "@/core/engine";
import { formatCents } from "@/core/money";
import { focusHref } from "@/features/focus-link";
import { Eyebrow, Marginalia } from "@/features/ui";
import { cn } from "@/lib/utils";
import {
  MONTH_CLOSE_ACKNOWLEDGED,
  isMonthCloseAcknowledged,
  monthCloseAcknowledgementKey,
} from "../month-close-state";
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

function closeMonth(context: WidgetContext): MonthClose | null {
  const close = context.aggregates.monthClose(context.today);
  if (
    !close ||
    close.completedTaskCount === close.totalTaskCount ||
    isMonthCloseAcknowledged(context.syncedSettings, close.yearMonth)
  ) {
    return null;
  }
  return close;
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
  hasClose = false,
}: {
  result: MoneyBrief;
  compact?: boolean;
  hasClose?: boolean;
}) {
  return (
    <div className={compact ? "mt-3" : "mt-4"}>
      <p className="text-sm font-medium">
        {hasClose ? "No other current matters." : "Nothing needs you right now."}
      </p>
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

function closeMonthName(yearMonth: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    new Date(`${yearMonth}-01T00:00:00`),
  );
}

function CloseTask({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5 text-sm">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center font-mono text-xs",
          done && "text-muted-foreground",
        )}
      >
        {done ? "✓" : "□"}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function candidateLabel(
  candidate: MonthCloseCandidate,
  occurrence: MonthCloseOccurrence,
): string {
  return `Use ${candidate.label} entry for ${occurrence.label} on ${dateLabel(occurrence.date)}`;
}

async function matchCandidate(
  context: WidgetContext,
  occurrence: MonthCloseOccurrence,
  candidate: MonthCloseCandidate,
): Promise<void> {
  const transaction = context.ledgerTransactions.find(
    (row) => row.id === candidate.transactionId,
  );
  if (!transaction || !context.dispatchOps) return;
  const duplicate = occurrence.pendingTransactionId
    ? (context.ledgerTransactions.find(
        (row) => row.id === occurrence.pendingTransactionId,
      ) ?? null)
    : null;
  const match = linkTransactionToRecurringOccurrence(
    transaction,
    occurrence.ruleId,
    occurrence.date,
  );
  const dismiss = duplicate ? voidTransaction(duplicate) : null;
  await context.dispatchOps([match, ...(dismiss ? [dismiss] : [])]);
  const dismissedRow = dismiss?.type === "transaction.void" ? dismiss.payload.row : null;
  toast.success("Entry matched", {
    description: `${candidate.label} now satisfies ${occurrence.label} on ${dateLabel(occurrence.date)}.`,
    action: {
      label: "Undo",
      onClick: () => {
        void context.dispatchOps?.([
          updateTransaction(transaction),
          ...(dismissedRow ? [unvoidTransaction(dismissedRow)] : []),
        ]);
      },
    },
  });
}

function CandidateRows({
  context,
  occurrence,
}: {
  context: WidgetContext;
  occurrence: MonthCloseOccurrence;
}) {
  if (occurrence.candidates.length === 0) {
    return (
      <p className="text-muted-foreground mt-1 text-xs">
        No exact manual candidate found within seven days.
      </p>
    );
  }
  return (
    <div className="mt-2 grid gap-2">
      {occurrence.candidates.map((candidate) => (
        <div
          key={candidate.transactionId}
          className="bg-surface-sunken flex flex-wrap items-center gap-2 rounded-lg px-3 py-2"
        >
          <div className="min-w-36 flex-1">
            <p className="truncate text-xs font-medium">{candidate.label}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {dateLabel(candidate.date)} ·{" "}
              <span className="tnum font-mono">{formatCents(candidate.amount)}</span>
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!context.dispatchOps}
            aria-label={candidateLabel(candidate, occurrence)}
            onClick={() => matchCandidate(context, occurrence, candidate)}
          >
            Use this entry
          </Button>
        </div>
      ))}
      {occurrence.pendingTransactionId && (
        <p className="text-muted-foreground text-xs">
          The pending duplicate will be dismissed with this match; Undo restores both.
        </p>
      )}
    </div>
  );
}

function MonthCloseSection({
  context,
  close,
}: {
  context: WidgetContext;
  close: MonthClose;
}) {
  const month = closeMonthName(close.yearMonth);
  const staleCount = close.staleValues.staleCount + close.staleValues.missingCount;
  return (
    <section className="rule-double mt-5 pt-4" aria-labelledby="money-brief-close">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow id="money-brief-close" as="h3">
          Close {month}
        </Eyebrow>
        <span className="text-muted-foreground font-mono text-xs">
          {close.completedTaskCount} of {close.totalTaskCount} done
        </span>
      </div>
      <div className="mt-2">
        <CloseTask done={close.pendingCount === 0}>
          {close.pendingCount === 0 ? (
            "No pending entries remain"
          ) : (
            <Link href="/inbox" className="underline-offset-4 hover:underline">
              {close.pendingCount} pending{" "}
              {close.pendingCount === 1 ? "entry remains" : "entries remain"}
            </Link>
          )}
        </CloseTask>
        <CloseTask done={close.overBudget.length === 0}>
          {close.overBudget.length === 0 ? (
            "No category ended above its allowance"
          ) : close.overBudget.length === 1 ? (
            <Link
              href={focusHref("/categories", close.overBudget[0].categoryId)}
              className="underline-offset-4 hover:underline"
            >
              {close.overBudget[0].name} ended {formatCents(close.overBudget[0].over)}{" "}
              above allowance
            </Link>
          ) : (
            <span>{close.overBudget.length} categories ended above allowance</span>
          )}
        </CloseTask>
        <CloseTask done={close.unmatchedOccurrences.length === 0}>
          <p>
            {close.unmatchedOccurrences.length === 0
              ? "No expected occurrence is unmatched"
              : `${close.unmatchedOccurrences.length} expected ${close.unmatchedOccurrences.length === 1 ? "occurrence is" : "occurrences are"} unmatched`}
          </p>
          {close.unmatchedOccurrences.map((occurrence) => (
            <div key={`${occurrence.ruleId}:${occurrence.date}`} className="mt-2">
              <Link
                href={focusHref("/recurring", occurrence.ruleId)}
                className="text-xs underline-offset-4 hover:underline"
              >
                {occurrence.label} · {dateLabel(occurrence.date)} ·{" "}
                <span className="tnum font-mono">
                  {occurrence.amount === null
                    ? "set later"
                    : formatCents(occurrence.amount)}
                </span>
              </Link>
              <CandidateRows context={context} occurrence={occurrence} />
            </div>
          ))}
        </CloseTask>
        <CloseTask done={staleCount === 0}>
          {staleCount === 0 ? (
            "Investment values are current"
          ) : (
            <Link href="/containers" className="underline-offset-4 hover:underline">
              {staleCount} investment {staleCount === 1 ? "value needs" : "values need"}{" "}
              refresh
            </Link>
          )}
        </CloseTask>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Marginalia className="text-xs">
          Candidates never count until you choose one.
        </Marginalia>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!context.dispatchOps}
          aria-label={`Acknowledge ${month} close`}
          onClick={() =>
            context.dispatchOps?.([
              setSetting(
                monthCloseAcknowledgementKey(close.yearMonth),
                MONTH_CLOSE_ACKNOWLEDGED,
              ),
            ])
          }
        >
          Acknowledge {month}
        </Button>
      </div>
    </section>
  );
}

function countLabel(count: number, compact = false): string {
  if (compact) return `${count} need you`;
  return `${count} ${count === 1 ? "thing needs" : "things need"} you`;
}

export function MoneyBriefExpanded(context: WidgetContext) {
  const result = brief(context);
  const close = closeMonth(context);
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
        <AllClear result={result} hasClose={Boolean(close)} />
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
      {close && <MonthCloseSection context={context} close={close} />}
    </div>
  );
}

export function MoneyBriefCompact(context: WidgetContext) {
  const result = brief(context);
  const close = closeMonth(context);
  const openCloseTasks = close ? close.totalTaskCount - close.completedTaskCount : 0;
  return (
    <div>
      {result.totalItems === 0 ? (
        <AllClear result={result} compact hasClose={Boolean(close)} />
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
      {close && (
        <p className="rule-double text-muted-foreground mt-3 pt-2 text-xs">
          Close {closeMonthName(close.yearMonth)} · {openCloseTasks} open
        </p>
      )}
    </div>
  );
}
