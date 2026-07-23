"use client";

import { CheckIcon, GitCompareIcon } from "lucide-react";
import {
  PERIOD_PRESETS,
  type PeriodPreset,
  type ReportingPeriod,
} from "@/core/engine/period";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { chipClass } from "@/features/FilterBar";
import { todayIso } from "@/features/clock";

/** One label per preset, exhaustively — adding a preset to the engine's list
 *  without naming it here is a type error rather than a blank menu row. */
export const PRESET_LABEL: Record<PeriodPreset, string> = {
  "last-month": "Last month",
  "last-3-months": "Last 3 months",
  "last-6-months": "Last 6 months",
  "last-12-months": "Last 12 months",
  ytd: "Year to date",
  all: "All time",
};

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** What the chip says it is showing. A custom window names its own dates —
 *  "Custom" alone would make the reader open the menu to find out. */
export function periodLabel(period: ReportingPeriod): string {
  if (period.kind === "preset") return PRESET_LABEL[period.preset];
  const f = (iso: string) => shortDate.format(new Date(`${iso}T00:00:00`));
  return `${f(period.start)} – ${f(period.end)}`;
}

/**
 * The unified reporting-period control (§6.1) + two-range compare (§6.2).
 *
 * It is a CHIP over a popover rather than the inline select-plus-date-inputs it
 * used to be: that row was ~370px wide and this control now sits on the page
 * header's eyebrow line, inside a 350px column. A chip is ~130px, says which
 * window is active, and hands the custom dates a surface with room for them.
 */
function PeriodChip({
  period,
  onChange,
  label,
}: {
  period: ReportingPeriod;
  onChange: (p: ReportingPeriod) => void;
  /** Names the chip for a screen reader — two of these can be on screen. */
  label: string;
}) {
  const custom = period.kind === "custom";
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${label}: ${periodLabel(period)}`}
        className={cn(chipClass(true), "max-w-44 truncate")}
      >
        {periodLabel(period)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-1.5">
        {PERIOD_PRESETS.map((preset) => {
          const active = period.kind === "preset" && period.preset === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onChange({ kind: "preset", preset })}
              className="hover:bg-accent flex w-full items-center gap-2 rounded-lg py-2 pr-2 pl-2 text-left text-sm"
            >
              <CheckIcon
                className={cn("size-3.5 shrink-0", !active && "invisible")}
                aria-hidden
              />
              {PRESET_LABEL[preset]}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const end = todayIso();
            onChange({ kind: "custom", start: `${end.slice(0, 4)}-01-01`, end });
          }}
          className="hover:bg-accent flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm"
        >
          <CheckIcon
            className={cn("size-3.5 shrink-0", !custom && "invisible")}
            aria-hidden
          />
          Custom…
        </button>

        {custom && (
          <div className="mt-1 grid grid-cols-2 gap-2 border-t pt-2">
            <label className="block">
              <span className="text-muted-foreground mb-1 block text-xs">From</span>
              <Input
                type="date"
                aria-label="Start date"
                value={period.start}
                max={period.end}
                onChange={(e) => onChange({ ...period, start: e.target.value })}
                // `Input` ships `text-base md:text-sm`; a size class displaces
                // only the base one, so the variant has to be restated.
                className="tnum h-8 text-sm md:text-sm"
              />
            </label>
            <label className="block">
              <span className="text-muted-foreground mb-1 block text-xs">To</span>
              <Input
                type="date"
                aria-label="End date"
                value={period.end}
                min={period.start}
                onChange={(e) => onChange({ ...period, end: e.target.value })}
                className="tnum h-8 text-sm md:text-sm"
              />
            </label>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function PeriodPicker({
  period,
  onPeriodChange,
  comparePeriod,
  onCompareChange,
}: {
  period: ReportingPeriod;
  onPeriodChange: (p: ReportingPeriod) => void;
  comparePeriod: ReportingPeriod | null;
  onCompareChange: (p: ReportingPeriod | null) => void;
}) {
  const comparing = comparePeriod !== null;
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
      <PeriodChip period={period} onChange={onPeriodChange} label="Reporting period" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Compare with another period"
        aria-pressed={comparing}
        className={cn("h-8 shrink-0 rounded-full px-2", comparing && "text-primary")}
        onClick={() =>
          onCompareChange(comparing ? null : { kind: "preset", preset: "last-month" })
        }
      >
        <GitCompareIcon className="size-4" />
        <span className="sr-only sm:not-sr-only">Compare</span>
      </Button>
      {comparePeriod && (
        <>
          <span className="text-muted-foreground text-xs">vs</span>
          <PeriodChip
            period={comparePeriod}
            onChange={onCompareChange}
            label="Compared period"
          />
        </>
      )}
    </div>
  );
}
