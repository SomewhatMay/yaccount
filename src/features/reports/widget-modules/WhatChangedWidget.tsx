"use client";

import Link from "next/link";
import type { WhatChanged, WhatChangedDriver } from "@/core/engine";
import { formatCents } from "@/core/money";
import { ledgerHref } from "@/features/ledger/deep-link";
import { Eyebrow, LeaderRow, Marginalia, Money, RuledTotal } from "@/features/ui";
import type { WidgetContext } from "../registry";

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function date(iso: string): string {
  return shortDate.format(new Date(`${iso}T00:00:00`));
}

function comparisonLabel(result: WhatChanged): string {
  return `${date(result.currentRange.start!)}–${date(result.currentRange.end!)} vs ${date(result.previousRange.start!)}–${date(result.previousRange.end!)}`;
}

function changePhrase(cents: number): string {
  if (cents === 0) return "Kept money held steady";
  return `You kept ${formatCents(Math.abs(cents))} ${cents > 0 ? "more" : "less"} than the prior period`;
}

function driverLabel(driver: WhatChangedDriver): string {
  if (driver.kind === "income") {
    return `${driver.contribution > 0 ? "Higher" : "Lower"} ${driver.label} income`;
  }
  return `${driver.contribution > 0 ? "Less" : "More"} ${driver.label} spending`;
}

function driverHref(driver: WhatChangedDriver, result: WhatChanged): string {
  return ledgerHref({
    categoryIds: driver.categoryIds,
    ...(driver.source ? { text: driver.source } : {}),
    range: { start: result.previousRange.start, end: result.currentRange.end },
  });
}

function MissingComparison() {
  return (
    <div role="status" className="py-5 text-center">
      <Eyebrow>Comparison unavailable</Eyebrow>
      <p className="mt-2 text-sm font-medium">Choose a bounded period</p>
      <p className="text-muted-foreground mx-auto mt-1 max-w-md text-xs leading-relaxed">
        Last month, a rolling period, or custom dates unlocks an equal-length prior
        comparison.
      </p>
    </div>
  );
}

function OpeningStatement({ result }: { result: WhatChanged }) {
  const change = result.changeInKept;
  return (
    <p className="font-display mt-1 text-2xl font-semibold tracking-tight">
      {change === 0 ? (
        "Kept money held steady"
      ) : (
        <>
          You kept <Money cents={Math.abs(change)} absolute className="font-display" />{" "}
          {change > 0 ? "more" : "less"}
        </>
      )}
    </p>
  );
}

export function WhatChangedExpanded(context: WidgetContext) {
  const result = context.aggregates.whatChanged(context.range);
  if (!result) return <MissingComparison />;
  const timing = result.drivers.find((driver) => driver.likelyTiming);
  const incomeChange = result.current.income - result.previous.income;
  const expenseChange = result.current.expense - result.previous.expense;

  return (
    <div role="group" aria-label={changePhrase(result.changeInKept)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>Compared with the prior period</Eyebrow>
        <span className="text-muted-foreground tnum font-mono text-xs">
          {comparisonLabel(result)}
        </span>
      </div>
      <OpeningStatement result={result} />

      <div className="mt-5">
        <LeaderRow label="Income">
          <span className="inline-flex items-baseline gap-3">
            <Money cents={result.current.income} tone="in" />
            <Money cents={incomeChange} showPlus className="text-muted-foreground" />
          </span>
        </LeaderRow>
        <LeaderRow label="Spending">
          <span className="inline-flex items-baseline gap-3">
            <Money cents={result.current.expense} />
            <Money cents={expenseChange} showPlus className="text-muted-foreground" />
          </span>
        </LeaderRow>
        <RuledTotal label="Kept" cents={result.current.kept} />
      </div>

      <div className="mt-5">
        <Eyebrow>Largest drivers</Eyebrow>
        <div className="mt-1">
          {result.drivers.map((driver) => (
            <Link
              key={`${driver.kind}:${driver.key}`}
              href={driverHref(driver, result)}
              className="hover:bg-muted/45 focus-visible:ring-ring/50 block rounded-lg px-1 focus-visible:ring-3 focus-visible:outline-none"
            >
              <LeaderRow label={driverLabel(driver)}>
                <Money cents={driver.contribution} showPlus />
              </LeaderRow>
            </Link>
          ))}
          <LeaderRow label="Everything else">
            <Money cents={result.everythingElse} showPlus />
          </LeaderRow>
        </div>
        <RuledTotal label="Change in kept" cents={result.changeInKept} emphasis="grand" />
      </div>

      {timing && (
        <Marginalia className="mt-4 text-xs">
          Likely timing: {timing.label} also appears near a period edge; deposit timing
          can shift this comparison.
        </Marginalia>
      )}
    </div>
  );
}

export function WhatChangedCompact(context: WidgetContext) {
  const result = context.aggregates.whatChanged(context.range);
  if (!result) return <MissingComparison />;
  const shown = result.drivers.slice(0, 3);
  const other =
    result.changeInKept - shown.reduce((sum, driver) => sum + driver.contribution, 0);

  return (
    <div role="group" aria-label={changePhrase(result.changeInKept)}>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>Versus prior period</Eyebrow>
        <span className="text-muted-foreground tnum font-mono text-xs">
          {date(result.currentRange.start!)}–{date(result.currentRange.end!)}
        </span>
      </div>
      <OpeningStatement result={result} />
      <div className="mt-3">
        {shown.map((driver) => (
          <LeaderRow key={`${driver.kind}:${driver.key}`} label={driver.label}>
            <Money cents={driver.contribution} showPlus />
          </LeaderRow>
        ))}
        <LeaderRow label="Other">
          <Money cents={other} showPlus />
        </LeaderRow>
      </div>
      <Marginalia className="mt-3 text-xs">
        Drivers reconcile to {result.changeInKept > 0 ? "+" : ""}
        {formatCents(result.changeInKept)}.
      </Marginalia>
    </div>
  );
}
