"use client";

import { differenceInCalendarDays } from "date-fns";
import { formatCents } from "@/core/money";
import type { MoneyMap, MoneyMapBranch, MoneyMapItem } from "@/core/engine";
import { Eyebrow, Marginalia, Money, RuledTotal } from "@/features/ui";
import type { WidgetContext } from "../registry";

const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const BRANCH_LABEL: Record<MoneyMapBranch["kind"], string> = {
  counted: "Counted in overall balance",
  goals: "Active goal containers",
  investments: "Investments",
  other: "Other",
};

function dateLabel(iso: string): string {
  return dayFormat.format(new Date(`${iso}T00:00:00`));
}

function totalLabel(map: MoneyMap): string {
  return map.unvaluedCount > 0 ? "Known tracked value" : "Tracked value";
}

function ariaSummary(map: MoneyMap): string {
  const unvalued =
    map.unvaluedCount > 0
      ? `; ${map.unvaluedCount} unvalued ${map.unvaluedCount === 1 ? "container" : "containers"}`
      : "";
  return `${totalLabel(map)} ${formatCents(map.knownTrackedValue)}${unvalued}`;
}

function snapshotAge(today: string, date: string): number {
  return Math.max(
    0,
    differenceInCalendarDays(new Date(`${today}T00:00:00`), new Date(`${date}T00:00:00`)),
  );
}

function compactFreshness(map: MoneyMap, today: string): string {
  const snapshotDates = map.branches.flatMap((branch) =>
    branch.items.flatMap((item) => (item.snapshotDate ? [item.snapshotDate] : [])),
  );
  const maximumAge = Math.max(
    0,
    ...snapshotDates.map((date) => snapshotAge(today, date)),
  );
  const valued =
    snapshotDates.length === 0
      ? "Transaction-derived cash is current."
      : maximumAge === 0
        ? "Snapshot values current today."
        : `Values current within ${maximumAge} ${maximumAge === 1 ? "day" : "days"}.`;
  if (map.unvaluedCount === 0) return valued;
  return `${map.unvaluedCount} ${map.unvaluedCount === 1 ? "investment is" : "investments are"} unvalued. ${valued}`;
}

function detailedFreshness(map: MoneyMap, today: string): string {
  const snapshots = map.branches.flatMap((branch) =>
    branch.items.flatMap((item) =>
      item.snapshotDate
        ? [
            `${item.name} updated ${
              snapshotAge(today, item.snapshotDate) === 0
                ? "today"
                : `${snapshotAge(today, item.snapshotDate)} ${
                    snapshotAge(today, item.snapshotDate) === 1 ? "day" : "days"
                  } ago`
            }`,
          ]
        : [],
    ),
  );
  const notes = [
    ...snapshots,
    ...(map.unvaluedCount > 0
      ? [
          `${map.unvaluedCount} ${map.unvaluedCount === 1 ? "investment has" : "investments have"} no reported value`,
        ]
      : []),
  ];
  return notes.length > 0
    ? `${notes.join("; ")}. Transaction-derived cash is current.`
    : "Transaction-derived cash is current.";
}

export function MoneyMapExpanded(context: WidgetContext) {
  const map = context.aggregates.moneyMap();
  const counted = map.branches.find((branch) => branch.kind === "counted")!;
  const outside = map.branches.filter((branch) => branch.kind !== "counted");
  const outsideKnown = outside.reduce((sum, branch) => sum + branch.knownValue, 0);
  const outsideUnvalued = outside.reduce((sum, branch) => sum + branch.unvaluedCount, 0);

  return (
    <div role="group" aria-label={ariaSummary(map)}>
      <div className="flex items-center justify-between gap-4">
        <Eyebrow>{totalLabel(map)}</Eyebrow>
        <span className="text-muted-foreground text-xs">
          as of {dateLabel(context.today)}
        </span>
      </div>
      <Money cents={map.knownTrackedValue} className="figure-md mt-1 block" />
      {map.unvaluedCount > 0 && (
        <p className="text-muted-foreground mt-1 text-xs">
          {map.unvaluedCount} unvalued{" "}
          {map.unvaluedCount === 1 ? "container" : "containers"}
        </p>
      )}

      <div className="mt-5 space-y-3">
        <p className="leaders py-1.5 text-sm font-medium">
          <span>All tracked value</span>
          <Money cents={map.knownTrackedValue} />
        </p>
        <BranchDetails branch={counted} />
        <div className="ml-4 border-l pl-4">
          <p className="leaders py-1.5 text-sm font-medium">
            <span>Outside overall balance</span>
            <span className="inline-flex items-center gap-2">
              <Money cents={outsideKnown} />
              {outsideUnvalued > 0 && (
                <span className="text-muted-foreground text-xs">
                  {outsideUnvalued} unvalued
                </span>
              )}
            </span>
          </p>
          <div className="mt-1 space-y-2">
            {outside.map((branch) => (
              <BranchDetails key={branch.kind} branch={branch} />
            ))}
          </div>
        </div>
        <RuledTotal
          label={totalLabel(map)}
          cents={map.knownTrackedValue}
          emphasis="grand"
        />
      </div>

      <Marginalia className="mt-4 text-xs">
        {detailedFreshness(map, context.today)}
      </Marginalia>
    </div>
  );
}

function BranchDetails({ branch }: { branch: MoneyMapBranch }) {
  return (
    <details open className="group/branch">
      <summary className="leaders cursor-pointer list-none py-1.5 text-sm [&::-webkit-details-marker]:hidden">
        <span className="font-medium">{BRANCH_LABEL[branch.kind]}</span>
        <span className="inline-flex items-center gap-2">
          <Money cents={branch.knownValue} />
          {branch.unvaluedCount > 0 && (
            <span className="text-muted-foreground text-xs">
              {branch.unvaluedCount} unvalued
            </span>
          )}
        </span>
      </summary>
      <div className="ml-4 border-l pl-4">
        {branch.items.length === 0 ? (
          <p className="text-muted-foreground py-1.5 text-xs">None</p>
        ) : (
          branch.items.map((item) => <ContainerRow key={item.containerId} item={item} />)
        )}
      </div>
    </details>
  );
}

function ContainerRow({ item }: { item: MoneyMapItem }) {
  const annotations = [
    ...(item.goalNames.length > 0 ? ["active goal"] : []),
    ...(item.isInvestment ? ["investment"] : []),
    ...(item.valuation === "ledger" && item.isInvestment ? ["counted here"] : []),
    ...(item.snapshotDate ? [`reported ${dateLabel(item.snapshotDate)}`] : []),
  ];
  return (
    <div className="leaders py-1.5 text-sm">
      <span className="min-w-0">
        <span className="block truncate">{item.name}</span>
        {annotations.length > 0 && (
          <span className="text-muted-foreground block text-xs">
            {annotations.join(" · ")}
          </span>
        )}
      </span>
      {item.value === null ? (
        <span className="text-muted-foreground tnum font-mono text-xs">Unvalued</span>
      ) : (
        <Money cents={item.value} />
      )}
    </div>
  );
}

export function MoneyMapCompact(context: WidgetContext) {
  const map = context.aggregates.moneyMap();
  return (
    <div role="group" aria-label={ariaSummary(map)}>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>{totalLabel(map)}</Eyebrow>
        <span className="text-muted-foreground text-xs">
          {dateLabel(context.today).replace(`, ${context.today.slice(0, 4)}`, "")}
        </span>
      </div>
      <Money cents={map.knownTrackedValue} className="figure-md mt-1 block" />
      <div className="mt-3">
        {map.branches.map((branch) => (
          <p key={branch.kind} className="leaders py-1 text-sm">
            <span>{BRANCH_LABEL[branch.kind]}</span>
            <span className="inline-flex items-center gap-1.5">
              <Money cents={branch.knownValue} />
              {branch.unvaluedCount > 0 && (
                <span className="text-muted-foreground text-xs">
                  +{branch.unvaluedCount} unvalued
                </span>
              )}
            </span>
          </p>
        ))}
      </div>
      <Marginalia className="mt-3 text-xs">
        {compactFreshness(map, context.today)}
      </Marginalia>
    </div>
  );
}
