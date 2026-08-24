"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type {
  CommitmentMode,
  CommitmentOccurrence,
  CommitmentSection,
  Commitments,
} from "@/core/engine";
import { formatCents } from "@/core/money";
import { focusHref } from "@/features/focus-link";
import { Eyebrow, LeaderRow, Marginalia, Money } from "@/features/ui";
import { cn } from "@/lib/utils";
import type { WidgetContext } from "../registry";

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const shortMonth = new Intl.DateTimeFormat("en-US", { month: "short" });

function dateLabel(date: string): string {
  return shortDate.format(new Date(`${date}T00:00:00`));
}

function monthLabel(month: string): string {
  return shortMonth.format(new Date(`${month}-01T00:00:00`)).toLocaleUpperCase("en-US");
}

function selectedMode(context: WidgetContext): CommitmentMode {
  return context.instanceSettings?.commitmentsMode === "irregular"
    ? "irregular"
    : "regular";
}

function saveMode(context: WidgetContext, mode: CommitmentMode): void {
  void context.saveInstanceSettings?.({
    ...context.instanceSettings,
    commitmentsMode: mode,
  });
}

function ModePicker({ context, mode }: { context: WidgetContext; mode: CommitmentMode }) {
  return (
    <div className="bg-muted/50 flex rounded-full p-0.5" aria-label="Commitment mode">
      {(["regular", "irregular"] as const).map((option) => (
        <Button
          key={option}
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Show ${option} commitments`}
          aria-pressed={mode === option}
          className={cn(
            "h-7 rounded-full px-2.5 text-xs capitalize",
            mode === option && "bg-background shadow-xs",
          )}
          onClick={() => saveMode(context, option)}
        >
          {option}
        </Button>
      ))}
    </div>
  );
}

function RuleAmount({ amount }: { amount: number | null }) {
  return amount === null ? (
    <span className="text-muted-foreground text-xs">set later</span>
  ) : (
    <Money cents={amount} tone="quiet" />
  );
}

function RegularView({ result }: { result: Commitments }) {
  return (
    <div>
      <div
        aria-label={`Scheduled monthly load: ${formatCents(result.regular.monthlyEquivalent)}`}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <Eyebrow>Scheduled monthly load</Eyebrow>
        <Money cents={result.regular.monthlyEquivalent} className="figure-lg" />
      </div>
      <div className="mt-5 grid gap-5">
        {result.regular.groups.map((group) => (
          <section
            key={group.categoryId}
            aria-labelledby={`commitment-${group.categoryId}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <Eyebrow id={`commitment-${group.categoryId}`} as="h3">
                {group.categoryName}
              </Eyebrow>
              <Money cents={group.monthlyEquivalent} tone="quiet" />
            </div>
            <div className="mt-1">
              {group.rules.map((rule) => (
                <Link
                  key={rule.ruleId}
                  href={focusHref("/recurring", rule.ruleId)}
                  className="hover:bg-muted/45 focus-visible:ring-ring/50 -mx-1 grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-baseline gap-2 rounded-lg px-1 py-1.5 text-sm focus-visible:ring-3 focus-visible:outline-none"
                >
                  <span className="text-muted-foreground font-mono text-xs">
                    {dateLabel(rule.nextOccurrence)}
                  </span>
                  <span className="min-w-0 truncate">{rule.label}</span>
                  <RuleAmount amount={rule.amount} />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div
        aria-label={`Scheduled monthly load: ${formatCents(result.regular.monthlyEquivalent)}`}
        className="rule-double mt-5 flex items-baseline justify-between gap-3 pt-2"
      >
        <Eyebrow as="span">Scheduled monthly load</Eyebrow>
        <Money cents={result.regular.monthlyEquivalent} className="figure-md" />
      </div>
      <Marginalia className="mt-3 text-xs">
        Active expense rules normalized over exact occurrences in the next 12 months.
      </Marginalia>
    </div>
  );
}

function IrregularRow({ occurrence }: { occurrence: CommitmentOccurrence }) {
  return (
    <Link
      href={focusHref("/recurring", occurrence.ruleId)}
      className="hover:bg-muted/45 focus-visible:ring-ring/50 -mx-1 grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-baseline gap-2 rounded-lg px-1 py-1.5 text-sm focus-visible:ring-3 focus-visible:outline-none"
    >
      <span className="text-muted-foreground font-mono text-xs">
        {dateLabel(occurrence.date)}
      </span>
      <span className="min-w-0 truncate">{occurrence.label}</span>
      <RuleAmount amount={occurrence.amount} />
    </Link>
  );
}

function IrregularView({ result }: { result: Commitments }) {
  return (
    <div>
      <div
        aria-label={`Known in the next 12 months: ${formatCents(result.irregular.knownNext12Months)}`}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <Eyebrow>Known in the next 12 months</Eyebrow>
        <Money cents={result.irregular.knownNext12Months} className="figure-lg" />
      </div>
      <div className="mt-5">
        {result.irregular.occurrences.map((occurrence) => (
          <IrregularRow
            key={`${occurrence.ruleId}:${occurrence.date}`}
            occurrence={occurrence}
          />
        ))}
      </div>
      <div
        aria-label={`Monthly equivalent: ${formatCents(result.irregular.monthlyEquivalent)}`}
        className="rule-double mt-5 flex items-baseline justify-between gap-3 pt-2"
      >
        <Eyebrow as="span">Monthly equivalent</Eyebrow>
        <Money cents={result.irregular.monthlyEquivalent} className="figure-md" />
      </div>
      <div className="-mx-1 mt-5 [scrollbar-width:none] overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-4" aria-label="Irregular costs by month">
          {result.irregular.months.map((month) => (
            <div key={month.month} className="w-12 text-center">
              <p className="eyebrow text-muted-foreground">{monthLabel(month.month)}</p>
              <p className="tnum mt-1 font-mono text-[0.6875rem]">
                {month.total === 0 ? "·" : formatCents(month.total)}
              </p>
            </div>
          ))}
        </div>
      </div>
      <Marginalia className="mt-3 text-xs">
        Equivalent spreads known costs; it does not mean funds are reserved.
      </Marginalia>
    </div>
  );
}

function nextText(section: CommitmentSection): string {
  const next = section.nextOccurrence;
  if (!next) return "No occurrence in the next 12 months";
  return `Next: ${next.label}, ${dateLabel(next.date)}`;
}

export function CommitmentsExpanded(context: WidgetContext) {
  const result = context.aggregates.commitments(context.today);
  const mode = selectedMode(context);
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <ModePicker context={context} mode={mode} />
      </div>
      {mode === "regular" ? (
        <RegularView result={result} />
      ) : (
        <IrregularView result={result} />
      )}
    </div>
  );
}

export function CommitmentsCompact(context: WidgetContext) {
  const result = context.aggregates.commitments(context.today);
  const mode = selectedMode(context);
  const section = mode === "regular" ? result.regular : result.irregular;
  const label = mode === "regular" ? "Monthly load" : "Monthly equivalent";
  return (
    <div>
      <div className="flex justify-end">
        <ModePicker context={context} mode={mode} />
      </div>
      <div
        className="mt-3"
        aria-label={`${label}: ${formatCents(section.monthlyEquivalent)}`}
      >
        <LeaderRow label={label}>
          <Money cents={section.monthlyEquivalent} className="figure-md" />
        </LeaderRow>
      </div>
      <p className="mt-3 truncate text-sm">{nextText(section)}</p>
      {section.nextOccurrence?.amount !== null && section.nextOccurrence && (
        <p className="text-muted-foreground mt-1 font-mono text-xs">
          {formatCents(section.nextOccurrence.amount)}
        </p>
      )}
      <Marginalia className="mt-3 text-xs">
        {result.activeExpenseRuleCount} active expense{" "}
        {result.activeExpenseRuleCount === 1 ? "rule" : "rules"}.
      </Marginalia>
    </div>
  );
}
